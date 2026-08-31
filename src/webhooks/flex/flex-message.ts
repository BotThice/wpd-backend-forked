import { messagingApi } from '@line/bot-sdk';
import { ImageQuickReply } from '../quick-reply';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// FlexMessage type มันโดน deprecated ไปแล้วให้เรียก type ผ่าน messagingApi เท่านั้น (แต่ doc ไม่เขียนไว้ จะบ้า)
export const ClassifyFlex = (): messagingApi.FlexMessage => {
  const config = new ConfigService();
  const liff_classify_input = `${config.get<string>('USER_CLASSIFICATION')}`;
  Logger.debug(liff_classify_input, 'LIFF USER CLASSIFICATION URL');
  return {
    type: 'flex',
    altText: 'โปรดเลือกประเภทผู้ใช้ของคุณ',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: 'https://i.postimg.cc/3xh95LDs/image.png',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: 'กดเลือกตรงนี้',
                  // uri: 'https://liff.line.me/2007211748-NYb7nX3z',
                  uri: liff_classify_input,
                },
                color: '#434343',
                height: 'md',
                margin: 'none',
              },
            ],
            backgroundColor: '#D1E5FF',
            borderWidth: 'none',
            cornerRadius: 'lg',
            margin: 'none',
            spacing: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            paddingAll: 'none',
          },
        ],
        flex: 0,
      },
    },
  };
};

export const GreetingFlex1: messagingApi.FlexMessage = {
  type: 'flex',
  altText: 'ยินดีต้อนรับสู่ LINE หวานพอดี',
  contents: {
    type: 'bubble',
    size: 'mega',
    hero: {
      type: 'image',
      url: 'https://i.postimg.cc/cJ3R3Gq8/welcome.png',
      size: 'full',
      aspectRatio: '2:1',
      aspectMode: 'cover',
      margin: 'none',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ยินดีต้อนรับสู่ หวานพอดี',
              weight: 'bold',
              size: 'lg',
            },
            {
              type: 'text',
              text: 'ระบบช่วยติดตามพฤติกรรมการกิน เพื่อดูแลคนที่มีความเสี่ยงเบาหวานชนิดที่ 2',
              wrap: true,
              color: '#57564F',
              offsetTop: 'sm',
              contents: [
                {
                  type: 'span',
                  text: 'ระบบช่วยติดตามพฤติกรรมการกิน เพื่อดูแลคนที่',
                  color: '#717171',
                },
                {
                  type: 'span',
                  text: 'มีความเสี่ยงเบาหวานชนิดที่ 2',
                  weight: 'bold',
                  color: '#717171',
                },
              ],
            },
          ],
          paddingBottom: 'lg',
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'สวัสดีค่ะ มะลิเองนะคะ',
              size: 'lg',
              weight: 'bold',
            },
            {
              type: 'text',
              text: 'มะลิจะคอยเป็นผู้ช่วยดูแลสุขภาพให้คุณเองนะคะ',
              wrap: true,
              offsetTop: 'sm',
              color: '#717171',
            },
          ],
          paddingTop: 'md',
        },
      ],
      margin: 'sm',
      paddingAll: 'xxl',
    },
    styles: {
      footer: {
        separator: true,
      },
    },
  },
};

export const GreetingFlex2: messagingApi.FlexMessage = {
  type: 'flex',
  altText:
    'บางเมนูจาก AI อาจคลาดเคลื่อน แอดมินอัปเดตให้แม่นยำขึ้นเรื่อยๆค่ะ และกรุณาเลือกกลุ่มผู้ใช้ก่อนเริ่มค่ะ',
  contents: {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              wrap: true,
              color: '#57564F',
              offsetTop: 'sm',
              contents: [
                {
                  type: 'span',
                  text: '⚠️ บางเมนู',
                },
                {
                  type: 'span',
                  text: 'ใช้ AI ช่วยประมวลผล',
                  weight: 'bold',
                },
                {
                  type: 'span',
                  text: 'ข้อมูลอาจมีคลาดเคลื่อนบ้าง แอดมินจะคอยตรวจสอบและอัปเดตให้แม่นยำขึ้นเรื่อยๆ ค่ะ 😊',
                },
              ],
            },
          ],
          paddingBottom: 'lg',
        },
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'ก่อนเริ่มใช้งาน เลือกกลุ่มผู้ใช้ที่ตรงกับตัวเองด้านล่างก่อนนะคะ⬇️',
              wrap: true,
              offsetTop: 'sm',
            },
          ],
          paddingTop: 'md',
          paddingBottom: 'md',
        },
      ],
      margin: 'sm',
      paddingAll: 'xxl',
    },
    styles: {
      footer: {
        separator: true,
      },
    },
  },
};

export const RecordAskForImageFlex: messagingApi.FlexMessage = {
  type: 'flex',
  altText: 'ถ่ายรูปอาหาร หรือ เลือกรูปอาหารจากมือถือส่งมาให้มะลิหน่อยนะคะ~',
  contents: {
    type: 'bubble',
    size: 'giga',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'บันทึกอาหารวันนี้ 📘',
          weight: 'bold',
          size: '22px',
          color: '#0B74E5',
          align: 'center',
        },
        {
          type: 'separator',
          margin: 'md',
        },
        {
          type: 'text',
          margin: 'lg',
          size: '18px',
          wrap: true,
          align: 'center',
          color: '#12344D',
          contents: [
            {
              type: 'span',
              text: 'ถ่ายรูปอาหาร📸 ',
              weight: 'bold',
            },
            {
              type: 'span',
              text: 'หรือ ',
            },
            {
              type: 'span',
              text: 'เลือกรูป📱',
              weight: 'bold',
            },
          ],
        },
        {
          type: 'text',
          color: '#555555',
          align: 'center',
          size: '18px',
          margin: 'sm',
          contents: [
            {
              type: 'span',
              text: 'แล้วมะลิจะช่วย',
            },
            {
              type: 'span',
              text: 'บันทึก',
              weight: 'bold',
              color: '#333333',
            },
            {
              type: 'span',
              text: 'ให้นะคะ',
            },
          ],
        },
      ],
      paddingTop: 'xl',
      paddingBottom: 'lg',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'image',
          url: 'https://i.postimg.cc/PNs2T9QZ/how-to-take-pic-or-send-pic.png',
          size: 'full',
          aspectRatio: '2:1',
          aspectMode: 'cover',
        },
      ],
      paddingAll: 'none',
    },
  },
  quickReply: ImageQuickReply,
};

export const canEatCheckAskForImageFlex: messagingApi.FlexMessage = {
  type: 'flex',
  altText: 'ถ่ายรูปอาหาร หรือ เลือกรูปอาหารจากมือถือส่งมาให้มะลิหน่อยนะคะ~',
  contents: {
    type: 'bubble',
    size: 'giga',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'กินได้ก่อ 🤨',
          weight: 'bold',
          size: '22px',
          color: '#6B2FE5',
          align: 'center',
        },
        {
          type: 'separator',
          margin: 'md',
        },
        {
          type: 'text',
          margin: 'lg',
          size: '18px',
          wrap: true,
          align: 'center',
          color: '#12344D',
          contents: [
            {
              type: 'span',
              text: 'ถ่ายรูปอาหาร📸 ',
              weight: 'bold',
            },
            {
              type: 'span',
              text: 'หรือ ',
            },
            {
              type: 'span',
              text: 'เลือกรูป📱',
              weight: 'bold',
            },
          ],
        },
        {
          type: 'text',
          color: '#555555',
          align: 'center',
          size: '18px',
          margin: 'sm',
          contents: [
            {
              type: 'span',
              text: 'แล้วมะลิจะช่วย',
            },
            {
              type: 'span',
              text: 'ประเมิน',
              weight: 'bold',
              color: '#333333',
            },
            {
              type: 'span',
              text: 'ให้นะคะ',
            },
          ],
        },
      ],
      paddingTop: 'xl',
      paddingBottom: 'lg',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'image',
          url: 'https://i.postimg.cc/PNs2T9QZ/how-to-take-pic-or-send-pic.png',
          size: 'full',
          aspectRatio: '2:1',
          aspectMode: 'cover',
        },
      ],
      paddingAll: 'none',
    },
  },
  quickReply: ImageQuickReply,
};

// ไม่ใช้แล้ว
// export const TrueFalseMenuConfirmFlex = (
//   menu_name: string,
// ): Promise<messagingApi.FlexMessage> => {
//   return Promise.resolve({
//     type: 'flex',
//     altText: 'ยืนยันชื่อเมนูอาหาร',
//     contents: {
//       type: 'bubble',
//       size: 'mega',
//       body: {
//         type: 'box',
//         layout: 'vertical',
//         contents: [
//           {
//             type: 'text',
//             text: 'มะลิขอเดาว่าเมนูที่ทานคือ',
//             wrap: true,
//             weight: 'bold',
//             size: 'md',
//             align: 'center',
//             contents: [],
//           },
//           {
//             type: 'text',
//             text: `"${menu_name}" ใช่มั้ยคะ?`,
//             margin: 'sm',
//             size: 'md',
//             align: 'center',
//             weight: 'bold',
//           },
//         ],
//         paddingTop: 'xl',
//       },
//       footer: {
//         type: 'box',
//         layout: 'horizontal',
//         spacing: 'md',
//         contents: [
//           {
//             type: 'box',
//             layout: 'vertical',
//             contents: [
//               {
//                 type: 'button',
//                 action: {
//                   type: 'message',
//                   label: 'ใช่ ✅',
//                   text: 'ใช่แล้ว👍🏻',
//                 },
//                 color: '#333333',
//               },
//             ],
//             backgroundColor: '#D2ECC0',
//             cornerRadius: 'md',
//             paddingStart: 'none',
//           },
//           {
//             type: 'box',
//             layout: 'vertical',
//             contents: [
//               {
//                 type: 'button',
//                 action: {
//                   type: 'message',
//                   label: 'ไม่ใช่ ❌',
//                   text: 'ไม่ใช่นะ👎🏻',
//                 },
//                 color: '#333333',
//               },
//             ],
//             backgroundColor: '#FFD3D3',
//             cornerRadius: 'md',
//           },
//         ],
//         paddingBottom: 'xl',
//         paddingTop: 'sm',
//         paddingStart: 'lg',
//         paddingEnd: 'lg',
//       },
//     },
//     quickReply: CancleQuickReply,
//   });
// };

// export const MenuChoiceConfirmFlex = (
//   candidates: { name: string }[],
// ): messagingApi.FlexMessage => {
//   const config = new ConfigService();
//   const liff_menu_input = `${config.get<string>('MENU_INPUT')}`;
//   Logger.debug(liff_menu_input, 'LIFF URL');
//   try {
//     return {
//       type: 'flex',
//       altText: 'ยืนยันชื่อเมนูอาหาร',
//       contents: {
//         type: 'bubble',
//         size: 'giga',
//         body: {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             {
//               type: 'text',
//               text: 'เลือกเมนูอาหารที่',
//               align: 'center',
//               offsetBottom: 'none',
//               offsetTop: 'xs',
//               weight: 'bold',
//               size: 'lg',
//             },
//             {
//               type: 'text',
//               text: 'มะลิคิดว่าใกล้เคียงกับ',
//               weight: 'bold',
//               align: 'center',
//               size: 'lg',
//             },
//             {
//               type: 'text',
//               text: 'อาหารในรูปดูนะคะ',
//               weight: 'bold',
//               align: 'center',
//               size: 'lg',
//             },
//             {
//               type: 'separator',
//               margin: 'xl',
//             },
//             {
//               type: 'box',
//               layout: 'vertical',
//               backgroundColor: '#FFF8CC',
//               margin: 'lg',
//               cornerRadius: 'md',
//               paddingAll: 'lg',
//               action: {
//                 type: 'message',
//                 label: candidates[0].name,
//                 text: candidates[0].name,
//               },
//               contents: [
//                 {
//                   type: 'text',
//                   text: candidates[0].name,
//                   wrap: true,
//                   size: 'lg',
//                   align: 'center',
//                   color: '#333333',
//                   weight: 'regular',
//                 },
//               ],
//               offsetTop: 'none',
//             },
//             {
//               type: 'box',
//               layout: 'vertical',
//               backgroundColor: '#D5F5D0',
//               margin: 'lg',
//               cornerRadius: 'md',
//               paddingAll: 'lg',
//               action: {
//                 type: 'message',
//                 label: candidates[1].name,
//                 text: candidates[1].name,
//               },
//               contents: [
//                 {
//                   type: 'text',
//                   text: candidates[1].name,
//                   wrap: true,
//                   size: 'lg',
//                   align: 'center',
//                   color: '#333333',
//                   weight: 'regular',
//                 },
//               ],
//             },
//             {
//               type: 'box',
//               layout: 'vertical',
//               backgroundColor: '#D7EDFB',
//               margin: 'lg',
//               cornerRadius: 'md',
//               paddingAll: 'lg',
//               action: {
//                 type: 'message',
//                 label: candidates[2].name,
//                 text: candidates[2].name,
//               },
//               contents: [
//                 {
//                   type: 'text',
//                   text: candidates[2].name,
//                   wrap: true,
//                   size: 'lg',
//                   align: 'center',
//                   color: '#333333',
//                   weight: 'regular',
//                 },
//               ],
//             },
//             {
//               type: 'box',
//               layout: 'vertical',
//               backgroundColor: '#EADCF3',
//               margin: 'lg',
//               cornerRadius: 'md',
//               paddingAll: 'lg',
//               action: {
//                 type: 'message',
//                 label: candidates[3].name,
//                 text: candidates[3].name,
//               },
//               contents: [
//                 {
//                   type: 'text',
//                   text: candidates[3].name,
//                   wrap: true,
//                   size: 'lg',
//                   align: 'center',
//                   color: '#333333',
//                   weight: 'regular',
//                 },
//               ],
//             },
//             {
//               type: 'box',
//               layout: 'vertical',
//               backgroundColor: '#FFDBE8',
//               cornerRadius: 'md',
//               margin: 'lg',
//               paddingAll: 'lg',
//               action: {
//                 type: 'uri',
//                 label: 'ไม่มีเมนูที่ถูกต้อง พิมพ์ชื่ออาหารเอง',
//                 uri: liff_menu_input,
//               },
//               contents: [
//                 {
//                   type: 'text',
//                   text: 'ไม่มีเมนูที่ถูกต้อง',
//                   wrap: true,
//                   size: 'lg',
//                   align: 'center',
//                   color: '#333333',
//                   weight: 'regular',
//                 },
//                 {
//                   type: 'text',
//                   text: 'พิมพ์ชื่ออาหารเอง',
//                   wrap: true,
//                   size: 'lg',
//                   align: 'center',
//                   color: '#333333',
//                   margin: 'sm',
//                   weight: 'regular',
//                 },
//               ],
//             },
//           ],
//         },
//       },
//       quickReply: CancleQuickReply,
//     };
//   } catch (error) {
//     console.error('Error creating MenuChoiceConfirmFlex:', error);
//     throw error;
//   }
// };

// export const WhatMealFlex: messagingApi.FlexMessage = {
//   type: 'flex',
//   altText: 'อาหารในรูปคือมื้ออะไรคะ?',
//   contents: {
//     type: 'bubble',
//     size: 'kilo',
//     body: {
//       type: 'box',
//       layout: 'vertical',
//       contents: [
//         {
//           type: 'text',
//           text: 'อาหารในรูปนี้เป็นมื้อไหนคะ',
//           align: 'center',
//           offsetBottom: 'none',
//           offsetTop: 'xs',
//           weight: 'bold',
//           size: 'lg',
//         },
//         {
//           type: 'separator',
//           margin: 'lg',
//         },
//         {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             {
//               type: 'button',
//               action: {
//                 type: 'message',
//                 label: 'มื้อเช้า🍳',
//                 text: 'มื้อเช้า🍳',
//               },
//               color: '#333333',
//             },
//           ],
//           backgroundColor: '#FFF8CC',
//           margin: 'lg',
//           cornerRadius: 'md',
//         },
//         {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             {
//               type: 'button',
//               action: {
//                 type: 'message',
//                 label: 'มื้อกลางวัน🍛',
//                 text: 'มื้อกลางวัน🍛',
//               },
//               color: '#333333',
//             },
//           ],
//           margin: 'lg',
//           backgroundColor: '#D5F5D0',
//           cornerRadius: 'md',
//         },
//         {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             {
//               type: 'button',
//               action: {
//                 type: 'message',
//                 label: 'มื้อเย็น🍚',
//                 text: 'มื้อเย็น🍚',
//               },
//               color: '#333333',
//             },
//           ],
//           backgroundColor: '#D7EDFB',
//           margin: 'lg',
//           cornerRadius: 'md',
//         },
//         {
//           type: 'box',
//           layout: 'vertical',
//           contents: [
//             {
//               type: 'button',
//               action: {
//                 type: 'message',
//                 label: 'ของว่าง🧋',
//                 text: 'ของว่าง🧋',
//               },
//               color: '#333333',
//             },
//           ],
//           margin: 'lg',
//           cornerRadius: 'md',
//           backgroundColor: '#EADCF3',
//         },
//       ],
//     },
//   },
//   quickReply: CancleQuickReply,
// };