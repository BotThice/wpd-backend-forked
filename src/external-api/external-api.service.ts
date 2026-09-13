import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { Upload } from '@aws-sdk/lib-storage';
import { createS3Client } from 'src/images/spaceUtil';

import { FoodGradeType } from 'src/food-grades/entities/food-grade.entity';

type ImagePart = { type: 'image_url'; image_url: { url: string } };
type ContentPart = string | ImagePart;

interface OpenRouterChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'google/gemini-2.5-flash';

// Generous completion budgets so the JSON answer can never be cut off by the
// token cap. Reasoning/"thinking" is disabled per-call (see chatCompletion),
// so this budget is spent entirely on the visible JSON answer. Tune these if
// the finish_reason=length warning in chatCompletion ever fires in logs.
const MAX_TOKENS_MENU_CANDIDATES = 2048; // isFood + 4 short-name candidates
const MAX_TOKENS_GRADE = 1024; // 2 string fields
const MAX_TOKENS_FOOD_DATA = 4096; // largest schema, many optional enum arrays

@Injectable()
export class ExternalApiService {
  private readonly logger = new Logger(ExternalApiService.name);
  private readonly s3Client = createS3Client();
  cooking_method_enum = [
    'ทอด',
    'ต้ม',
    'นึ่ง',
    'ย่าง',
    'ลวก',
    'ดิบ',
    'ผัด',
    'ยำ',
    'ชุปแป้งทอด',
    'อบ',
    'ตุ๋น',
    'หมัก',
    'ปิ้ง',
  ] as const;

  constructor() {}

  /**
   * Calls Gemini 2.5 Flash through OpenRouter's OpenAI-compatible chat
   * completions endpoint, optionally constraining the output to a JSON schema.
   */
  private async chatCompletion(
    parts: ContentPart[],
    schema?: Record<string, unknown>,
    maxTokens: number = MAX_TOKENS_GRADE,
  ): Promise<string> {
    const content = parts.map((part) =>
      typeof part === 'string' ? { type: 'text', text: part } : part,
    );

    const response = await axios.post<OpenRouterChatCompletionResponse>(
      OPENROUTER_URL,
      {
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
        // This integration only ever needs a structured JSON answer, never
        // chain-of-thought. Gemini's "thinking" tokens are billed against
        // the same completion budget as the visible answer, so leaving
        // reasoning enabled risks truncating the JSON when the budget is
        // spent on thinking instead. Re-verify this shape against
        // OpenRouter's docs if it ever stops working:
        // https://openrouter.ai/docs/use-cases/reasoning-tokens
        reasoning: { enabled: false },
        ...(schema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'response', schema },
              },
            }
          : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          ...(process.env.BASE_URL
            ? { 'HTTP-Referer': process.env.BASE_URL }
            : {}),
          'X-Title': 'WPD',
        },
      },
    );

    const choice = response.data?.choices?.[0];
    const finishReason = choice?.finish_reason;
    this.logger.debug(
      `OpenRouter finish_reason=${finishReason ?? 'unknown'} usage=${JSON.stringify(
        response.data?.usage,
      )}`,
    );
    if (finishReason === 'length') {
      this.logger.warn(
        `OpenRouter response hit max_tokens=${maxTokens} (finish_reason=length); ` +
          'output may be truncated. Consider raising the relevant MAX_TOKENS_* constant.',
      );
    }

    const text = choice?.message?.content;
    if (typeof text !== 'string' || !text.length) {
      this.logger.error('Response from OpenRouter is empty:', response.data);
      throw new Error('Response from OpenRouter is empty');
    }
    return text;
  }

  /**
   * JSON.parse with diagnostics: if parsing fails (e.g. the model's output
   * was truncated), logs a bounded preview of the raw text so the failure is
   * root-causable from logs alone, then rethrows.
   */
  private parseJsonResponse<T>(text: string, context: string): T {
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      this.logger.error(
        `[${context}] Failed to parse JSON from OpenRouter (length=${text.length}): ${this.previewText(text)}`,
      );
      throw error;
    }
  }

  private previewText(text: string, edgeLength = 500): string {
    if (text.length <= edgeLength * 2) {
      return text;
    }
    const omitted = text.length - edgeLength * 2;
    return `${text.slice(0, edgeLength)}...<${omitted} chars omitted>...${text.slice(-edgeLength)}`;
  }

  private toDataUri(buffer: Buffer, mimeType: string): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  /**
   * OpenRouter has no persistent file store like Gemini's Files API, but the
   * app needs to reuse an already-seen image across separate, later requests
   * (e.g. grading a menu after the user picks it). We persist the bytes to
   * the existing S3-compatible bucket and hand back the object key, which is
   * stored wherever `geminiImageName` used to hold a Gemini file name.
   */
  private async storeImageForLaterUse(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = mimeType.split('/')[1] || 'jpg';
    const key = `meal_images/ai_cache/${Date.now()}-${randomUUID()}.${ext}`;
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.SPACE_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      },
    });
    await upload.done();
    return key;
  }

  private async loadStoredImageAsDataUri(key: string): Promise<string> {
    const object = await this.s3Client.getObject({
      Bucket: process.env.SPACE_NAME,
      Key: key,
    });
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error('Image not found in storage');
    }
    return this.toDataUri(
      Buffer.from(bytes),
      object.ContentType || 'image/jpeg',
    );
  }

  uploadImageToGemini(content: { buffer: Buffer; mimeType: string }) {
    try {
      const uri = this.toDataUri(content.buffer, content.mimeType);
      return { uri, mimeType: content.mimeType, name: 'inline' };
    } catch (error) {
      this.logger.error('Error preparing image for OpenRouter:', error);
      throw error;
    }
  }

  async getMenuCandidates(
    filePath?: string,
    content?: { buffer: Buffer; mimeType: string },
  ) {
    try {
      if (!filePath && !content) {
        throw new Error('Either filePath or buffer must be provided');
      }

      let buffer: Buffer;
      let mimeType: string;
      if (filePath) {
        buffer = await fs.promises.readFile(filePath);
        mimeType = 'image/jpeg';
      } else {
        buffer = content!.buffer;
        mimeType = content!.mimeType;
      }

      const dataUri = this.toDataUri(buffer, mimeType);
      const response = await this.geminiRequestMenus({
        uri: dataUri,
        mimeType,
      });
      response.geminiImageName = await this.storeImageForLaterUse(
        buffer,
        mimeType,
      );
      return response;
    } catch (error) {
      this.logger.error('Error in askMenuName:', error);
      throw error;
    }
  }

  async geminiRequestMenus(uploadedImage: { uri?: string; mimeType?: string }) {
    try {
      if (!uploadedImage.uri || !uploadedImage.mimeType) {
        this.logger.error('Image not available:', uploadedImage);
        throw new Error('Image not available');
      }

      const text = await this.chatCompletion(
        [
          'บอกเมนูรายการอาหารที่มีในภาพนี้มาให้ครบถ้วนทุกองค์ประกอบของเมนู เป็นภาษาไทย ไม่ควรเป็นชื่อที่ความหมายกว้างเกินไป ควรเป็นชื่อที่บ่งบอกถึงวัตถุดิบในนั้นได้ด้วยจะดีมาก',
          'หากมีหลายเมนูในภาพ ให้ตอบมาแบบบอกชื่อให้ครบตามจำนวนของเมนูที่เห็นในภาพ เช่น หากในรูปมี 3 อย่าง ให้ตอบ name: /[ส้มตำ,ไก่ย่าง,ข้าวเหนียว/] หากมี 1 อย่างให้ตอบ name: /[ส้มตำ/] ดังนั้น สมาชิกใน array name จึงมักจะไม่ใช่ชื่ออาหารชนิดใกล้เคียงกัน (ทุกสมาชิกใน array name ต้องมีขนาดรวมกันไม่เกิน 40 characters)` )',
          'นอกจากได้ array name มา 1 คำตอบแล้ว ให้เพิ่มตัวเลือก array name ที่มั่นใจรองลงมาอีก 3 ตัวเลือก ในลักษณะเดียวกันแต่ห้ามซ้ำกับคำตอบอื่นๆ ก็จะได้ลักษณะของ response เช่น [{name: ["น้ำพริก"], name: ["น้ำพริกอ่อง","ผักลวก"], name: [คำตอบที่ 2], name: [คำตอบที่ 3]}]',
          '(หากรูปภาพไม่ใช่รูปอาหารที่คนกินจริงๆเข่น รูปวาดอาหาร หรือภาพที่ไม่ใช่อาหาร ให้ตอบ isFood: false)',
          { type: 'image_url', image_url: { url: uploadedImage.uri } },
        ],
        {
          type: 'object',
          properties: {
            isFood: {
              type: 'boolean',
              description: 'Is the image food?',
            },
            candidates: {
              type: 'array',
              minItems: 4,
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'string',
                    },
                    description:
                      'ชื่อของอาหาร โดยที่มีความยาวรวมกันไม่เกิน 40 ตัวอักษร',
                  },
                },
              },
            },
          },
        },
        MAX_TOKENS_MENU_CANDIDATES,
      );

      return this.parseJsonResponse<{
        isFood: boolean;
        candidates: { name: string[] }[];
        geminiImageName: string | undefined;
      }>(text, 'geminiRequestMenus');
    } catch (error) {
      this.logger.error('Error at [geminiRequestMenusFromBuffer]:', error);
      throw error;
    }
  }

  async geminiRequestGrade(
    menu: string,
    topBestMatch?: Array<{ name: string; grade: string }>,
    geminiImageName?: string,
  ): Promise<{ answer: FoodGradeType; descp: string } | null> {
    if (topBestMatch) {
      this.logger.debug('Top best match:', topBestMatch);
    }
    try {
      const contentParts: ContentPart[] = [
        `บอกเกรดอาหารของเมนูชื่อ "${menu}"`,
        `โดยที่ประเมินเกรดตามเกณฑ์ "จัดหมวดหมู่อาหารที่กลุ่มเสี่ยงเบาหวาน(ไม่ใช่ผู้ป่วยเบาหวาน)ควรเลือกบริโภคตามกลุ่มค่ามวลน้ำตาล ค่านี้เป็นค่าที่ได้มาจากการคำนวณค่าดัชนีน้ำตาล (Glycemic Index: GI) ร่วมกับปริมาณอาหารที่รับประทานในแต่ละครั้ง เกรด A คือ ค่ามวลน้ำตาลต่ำกว่า 10 เกรด B คือ ค่ามวลน้ำตาล 11-19 เกรด C คือ ค่ามวลน้ำตาลตั้งแต่ 20ขึ้นไป`,
        `ให้ประเมินค่ามวลน้ำตาลจากชื่อเมนูอาหารที่ให้มาข้อมูลเฉลี่ยโดยทั่วไปของอาหารประเภทนั้นๆก่อน สามารถอ้างอิงจากข้อมูลในเว็บไซต์หรือแหล่งข้อมูลอื่นที่เชื่อถือได้`,
        `จากนั้นนำค่าน้ำตาลที่ได้มาจัดเกรดตามเกณฑ์ที่กำหนด`,
        `หาก "${menu}" ไม่ใช่ชื่ออาหารที่มีอยู่จริงในฐานข้อมูลอาหาร ให้ response กลับมาเป็น null`,
      ];

      if (topBestMatch) {
        contentParts.push(
          `และนี่คือข้อมูลอาหารที่มีdatabase ซึ่งมีความคล้ายคลึงกับเมนูที่ให้มามากที่สุด แต่ไม่ถึง 80% ${JSON.stringify(
            topBestMatch,
          )} ถสามารถอ้างอิงได้`,
        );
      }

      if (geminiImageName) {
        try {
          const imageDataUri =
            await this.loadStoredImageAsDataUri(geminiImageName);
          contentParts.push('ให้ดูในรูปประกอบ เพื่อป้องกันการสับสนจากชื่อเมนู');
          contentParts.push({
            type: 'image_url',
            image_url: { url: imageDataUri },
          });
        } catch (imageError) {
          this.logger.warn(
            'Could not load stored image for grading, continuing without it:',
            imageError,
          );
        }
      }

      const text = await this.chatCompletion(
        contentParts,
        {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              enum: ['A', 'B', 'C'],
            },
            descp: {
              type: 'string',
              description: 'Description of the grade',
            },
          },
        },
        MAX_TOKENS_GRADE,
      );

      if (text.includes('null')) {
        this.logger.debug('Response from OpenRouter is null');
        return null;
      }

      return this.parseJsonResponse<{
        answer: FoodGradeType;
        descp: string;
      }>(text, 'geminiRequestGrade');
    } catch (error) {
      this.logger.error('Error at [geminiRequestGrade]:', error);
      throw new Error('An unexpected error occurred in geminiRequestGrade');
    }
  }

  async geminiExtractFoodData(
    user_menu_name: string,
    content?: { uri: string; mimeType: string },
    geminiImageName?: string,
  ) {
    try {
      let imageUri: string;
      if (content) {
        imageUri = content.uri;
      } else if (geminiImageName) {
        imageUri = await this.loadStoredImageAsDataUri(geminiImageName);
      } else {
        throw new Error('Either content or geminiImageName must be provided');
      }

      this.logger.debug('Extracting food data for menu:', user_menu_name);

      const text = await this.chatCompletion(
        [
          `แยกข้อมูลอาหารสำหรับเมนู: ${user_menu_name} จากรูปนี้ โดยใช้ภาษาไทย`,
          { type: 'image_url', image_url: { url: imageUri } },
        ],
        {
          type: 'object',
          required: ['foodData', 'reason_description'],
          properties: {
            foodData: {
              type: 'object',
              required: [
                'cooking_method',
                'ingredients',
                'there_is_vegetable',
                'there_is_grain',
                'there_is_meat',
                'there_is_rice',
                'there_is_noodle',
                'there_is_sweet_fruit',
                'there_is_sweet',
                'there_is_drink',
                'there_is_snack',
                'there_is_sauce',
                'sauces',
                'grains',
                'rices',
                'noodles',
                'fruits',
                'drinks',
              ],
              properties: {
                cooking_method: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: this.cooking_method_enum,
                  },
                  minItems: 1,
                  description:
                    'วิธีการประกอบอาหาร (cooking_method) ต้องมีอย่างน้อย 1 วิธี',
                },
                ingredients: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  minItems: 1,
                },
                there_is_vegetable: {
                  type: 'boolean',
                  description: 'มีผักในเมนูหรือไม่',
                },
                there_is_grain: {
                  type: 'boolean',
                  description: 'มีธัญพืชในเมนูหรือไม่',
                },
                grains: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'ข้าวสาลี',
                      'ข้าวโพด',
                      'ข้าวบาร์เลย์',
                      'ข้าวโอ๊ต',
                      'ควินัว',
                      'ถั่วต่างๆ',
                      'อื่นๆ',
                    ],
                  },
                  description: 'ระบุชนิดของธัญพืช หากไม่มีธัญพืชให้เว้นว่างไว้',
                },
                there_is_meat: {
                  type: 'boolean',
                  description: 'มีเนื้อสัตว์ในเมนูหรือไม่',
                },
                there_is_rice: {
                  type: 'boolean',
                  description: 'มีข้าวในเมนูหรือไม่',
                },
                rices: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'ข้าวขาว',
                      'ข้าวกล้อง',
                      'ข้าวไรซ์เบอร์รี่',
                      'ข้าวเหนียว',
                      'ข้าวมันปู',
                      'อื่นๆ',
                    ],
                  },
                  description: 'ระบุชนิดของข้าว หากไม่มีข้าวให้เว้นว่างไว้',
                },
                there_is_noodle: {
                  type: 'boolean',
                  description: 'มีคาร์โบไฮเดรตชนิดเส้นในเมนูหรือไม่',
                },
                noodles: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'เส้นหมี่ขาว',
                      'บะหมี่ไข่',
                      'วุ้นเส้น',
                      'ก๋วยเตี๋ยวเส้นเล็ก',
                      'ก๋วยเตี๋ยวเส้นใหญ่',
                      'อุด้ง',
                      'ขนมจีน',
                      'เส้นบุก',
                      'บะหมี่หยก',
                      'เส้นบุก',
                      'สปาเกตตี',
                      'พาสต้า',
                      'ราเมน',
                      'มาม่า',
                      'มักกะโรนี',
                      'อื่นๆ',
                    ],
                  },
                  description:
                    'ระบุชนิดของเส้นก๋วยเตี๋ยวหรือบะหมี่ หากไม่มีเส้นในเมนูให้เว้นว่างไว้',
                },
                there_is_sweet_fruit: {
                  type: 'boolean',
                  description: 'มีผลไม้หวานในเมนูหรือไม่',
                },
                fruits: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                  description: 'ระบุชนิดของผลไม้ หากไม่มีผลไม้ให้เว้นว่างไว้',
                },
                there_is_sweet: {
                  type: 'boolean',
                  description: 'มีของหวานในเมนูหรือไม่',
                },
                there_is_drink: {
                  type: 'boolean',
                  description: 'มีเครื่องดื่มในเมนูหรือไม่',
                },
                drinks: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'น้ำเปล่า',
                      'น้ำผลไม้',
                      'น้ำอัดลม',
                      'ชา',
                      'กาแฟ',
                      'นม',
                      'แอลกอฮอล์',
                      'อื่นๆ',
                    ],
                  },
                  description:
                    'ระบุชนิดของเครื่องดื่ม หากไม่มีเครื่องดื่มให้เว้นว่างไว้',
                },
                there_is_snack: {
                  type: 'boolean',
                  description: 'มีของทานเล่นในเมนูหรือไม่',
                },
                there_is_sauce: {
                  type: 'boolean',
                  description: 'มีซอสในเมนูหรือไม่',
                },
                sauces: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'พริกน้ำปลา',
                      'ซีอิ๊ว',
                      'ซอสมะเขือเทศ',
                      'มายองเนส',
                      'น้ำจิ้มไก่',
                      'น้ำจิ้มซีฟู้ด',
                      'น้ำจิ้มสุกี้',
                      'น้ำจิ้มแจ่ว',
                      'น้ำปลา',
                      'ซอสหอยนางรม',
                      'ซอสปรุงรส',
                      'น้ำส้มสายชู',
                      'น้ำมันงา',
                      'น้ำมันพืช',
                      'น้ำมันมะกอก',
                      'น้ำจิ้มบ๊วย',
                      'น้ำจิ้มเต้าเจี้ยว',
                      'น้ำจิ้มถั่ว',
                      'น้ำจิ้มเปรี้ยวหวาน',
                      'น้ำจิ้มหมาล่า',
                      'ซอสพริกศรีราชา',
                      'ซอสเทอริยากิ',
                      'ซอสบาร์บีคิว',
                      'ซอสโหระพา',
                      'ซอสพอนสึ',
                      'ซอสทาโกะยากิ',
                      'ซอสยากิโทริ',
                      'ซอสครีมสลัด',
                      'น้ำสลัดครีม',
                      'น้ำสลัดซอสงา',
                    ],
                  },
                  description:
                    'ระบุชนิดของน้ำจิ้มหรือซอส หากไม่มีน้ำจิ้ม/ซอสให้เว้นว่างไว้',
                },
              },
            },
            reason_description: {
              type: 'string',
            },
          },
        },
        MAX_TOKENS_FOOD_DATA,
      );

      const parsed = this.parseJsonResponse<{
        foodData: {
          cooking_method: string[];
          ingredients: string[];
          there_is_vegetable: boolean;
          there_is_meat: boolean;
          there_is_rice: boolean;
          there_is_noodle: boolean;
          there_is_sweet_fruit: boolean;
          there_is_sweet: boolean;
          there_is_drink: boolean;
          there_is_snack: boolean;
          there_is_grain: boolean;
          there_is_sauce: boolean;
          sauces?: string[];
          grains?: string[];
          rices?: string[];
          noodles?: string[];
          fruits?: string[];
          drinks?: string[];
        };
        reason_description: string;
      }>(text, 'geminiExtractFoodData');

      const foodData = {
        name: user_menu_name,
        cooking_method: parsed.foodData.cooking_method,
        ingredients: parsed.foodData.ingredients,
        reason_description: parsed.reason_description,
        there_is_vegetable: parsed.foodData.there_is_vegetable,
        there_is_meat: parsed.foodData.there_is_meat,
        there_is_rice: parsed.foodData.there_is_rice,
        there_is_noodle: parsed.foodData.there_is_noodle,
        there_is_sweet_fruit: parsed.foodData.there_is_sweet_fruit,
        there_is_sweet: parsed.foodData.there_is_sweet,
        there_is_drink: parsed.foodData.there_is_drink,
        there_is_snack: parsed.foodData.there_is_snack,
        there_is_grain: parsed.foodData.there_is_grain,
        there_is_sauce: parsed.foodData.there_is_sauce,
        sauces: parsed.foodData.sauces || [],
        grains: parsed.foodData.grains || [],
        rices: parsed.foodData.rices || [],
        noodles: parsed.foodData.noodles || [],
        fruits: parsed.foodData.fruits || [],
        drinks: parsed.foodData.drinks || [],
      };

      return foodData;
    } catch (error) {
      this.logger.error('Error at [geminiExtractFoodData]:', error);
      throw new Error('An unexpected error occurred in geminiExtractFoodData');
    }
  }
}
