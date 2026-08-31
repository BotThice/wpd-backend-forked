import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FoodGrade, FoodGradeType } from './entities/food-grade.entity';
import { EntityManager, Repository, In } from 'typeorm';
import { CreateFoodGradeDto } from './dto/create-food-grade.dto';
import * as fuzzball from 'fuzzball';
import * as fs from 'fs';
import * as path from 'path';
import { ExternalApiService } from 'src/external-api/external-api.service';
import { UpdateFoodGradeDto } from './dto/update-food-grade.dto';
import { FoodDataDto } from './dto/food-data.dto';
// import { UpdateFoodGradeDto } from './dto/update-food-grade.dto';

type ScoringLog = {
  cooking_method: { method: string; deduction: number }[];
  meat: number | null;
  vegetable: number | null;
  rice: { rice: string; deduction: number }[];
  noodle: { noodle: string; deduction: number }[];
  fruit: number | null;
  sweet: number | null;
  drink: { drink: string; deduction: number }[];
  snack: number | null;
  sauce: number | null;
  grain: number | null;
};

@Injectable()
export class FoodGradesService implements OnModuleInit {
  logger = new Logger(FoodGradesService.name);
  constructor(
    @InjectRepository(FoodGrade)
    private readonly foodGradesRepository: Repository<FoodGrade>,
    private readonly api: ExternalApiService,
    private readonly entityManager: EntityManager,
  ) {}

  async onModuleInit() {
    await this.seedFoodGradesIfEmpty();
  }

  /**
   * Seeds the food_grades table from src/food-grades/seeds/food-grades.sql
   * the first time the table is created (or whenever it's found empty, e.g.
   * after resetting the database) so the app isn't left with no reference
   * data to match menus against.
   */
  private async seedFoodGradesIfEmpty() {
    const existingCount = await this.foodGradesRepository.count();
    if (existingCount > 0) {
      return;
    }

    const seedPath = path.join(__dirname, 'seeds', 'food-grades.sql');
    if (!fs.existsSync(seedPath)) {
      this.logger.warn(`Food grades seed file not found at ${seedPath}`);
      return;
    }

    const statements = fs
      .readFileSync(seedPath, 'utf8')
      .split(/;\s*\n/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await this.entityManager.query(statement);
    }

    this.logger.log(
      `Seeded food_grades table from ${seedPath} (${statements.length} statement(s))`,
    );
  }

  async create(createFoodGradeDto: CreateFoodGradeDto) {
    this.logger.log('Creating food grade with data:', createFoodGradeDto);
    const grade = createFoodGradeDto.grade;
    const category = createFoodGradeDto.category;
    const name = createFoodGradeDto.name;
    const description = createFoodGradeDto.description ?? '';
    const addedFromUser = createFoodGradeDto.addedFromUser ? true : false;

    const foodGrade = new FoodGrade();
    foodGrade.grade = grade;
    foodGrade.category = category;
    foodGrade.name = name;
    foodGrade.description = description;
    foodGrade.addedFromUser = addedFromUser;

    this.logger.log(
      `Saving food grade: { name: ${name}, grade: ${grade}, category: ${category}, description: ${description} }`,
    );

    const savedFoodGrade = await this.foodGradesRepository.save(foodGrade);

    return this.foodGradesRepository.findOne({
      where: { id: savedFoodGrade.id },
    });
  }

  findAll() {
    return this.foodGradesRepository.find();
  }

  findOne(id: number) {
    return `This action returns a #${id} foodGrade`;
  }

  async getMenuGrade(
    menus: string[],
    geminiImageName: string,
  ): Promise<{
    lowestGrade: FoodGradeType;
    maxScore: number;
    avgGrade: FoodGradeType;
    avgScore: number;
    foods: Array<{
      name: string;
      grade: FoodGradeType;
      description: string;
      grading_by_ai: boolean;
    }>;
  }> {
    try {
      let totalGrade = 0;
      const foods: Array<{
        name: string;
        grade: FoodGradeType;
        description: string;
        grading_by_ai: boolean;
      }> = [];
      for (const menu of menus) {
        // step 1: exact matching
        const exactFoodGrade = await this.foodGradesRepository.findOne({
          where: { name: menu },
        });

        if (exactFoodGrade) {
          this.logger.debug(
            `Exact match found for menu: ${menu} with ${exactFoodGrade.name}, grade: ${exactFoodGrade.grade}`,
          );
          const { grade } = exactFoodGrade;
          totalGrade += this.gradeToScore(grade);
          foods.push({
            name: menu,
            grade: this.validateGrade(exactFoodGrade.grade),
            description: `exactly match with {id: ${exactFoodGrade.id}, food: ${exactFoodGrade.name}, grade: ${exactFoodGrade.grade} } in database`,
            grading_by_ai: false,
          });
          continue;
        }

        // step 2: partial matching
        const allFood = await this.foodGradesRepository.find();
        const bestMatch = fuzzball.extract(
          menu,
          allFood.map((f) => f.name),
          { scorer: fuzzball.ratio },
        );

        // step 3: no match, send to Gemini
        const top5BestMatch = this.getTop5BestMatch(bestMatch, allFood);
        await this.api
          .geminiRequestGrade(menu, top5BestMatch, geminiImageName)
          .then((response) => {
            if (response === null)
              throw new Error('Gemini detected non food name');
            totalGrade += this.gradeToScore(response.answer);
            foods.push({
              name: menu,
              grade: this.validateGrade(response.answer),
              description: response.descp,
              grading_by_ai: true,
            });
          });

        continue;
      }

      const scores = foods.map((food) => {
        return this.gradeToScore(food.grade);
      });
      const maxScore = Math.max(...scores);

      return {
        lowestGrade: this.scoreToGrade(maxScore),
        maxScore: maxScore,
        avgGrade: this.scoreToGrade(totalGrade / menus.length),
        avgScore: totalGrade / menus.length,
        foods,
      };
    } catch (error) {
      this.logger.error('Error at [getMenuGrade]:', error);
      throw error;
    }
  }

  getTop5BestMatch(
    bestMatch: [string, number][],
    allFood: FoodGrade[],
  ): { name: string; grade: string }[] {
    return bestMatch.slice(0, 5).map((match) => {
      const matchedFood = allFood.find((f) => f.name === match[0]);
      return {
        name: match[0],
        grade: matchedFood ? matchedFood.grade : 'N/A',
      };
    });
  }

  gradeToScore(grade: FoodGradeType): number {
    switch (grade) {
      case 'A':
        return 1;
      case 'B':
        return 2;
      case 'C':
        return 3;
      default:
        return 0;
    }
  }

  validateGrade(grade: string): FoodGradeType {
    if (grade === 'A' || grade === 'B' || grade === 'C') {
      return grade;
    }
    throw new Error(`Invalid grade: ${grade}`);
  }

  scoreToGrade(score: number): FoodGradeType {
    if (score <= 1.5) {
      return 'A';
    }
    if (score <= 2.5) {
      return 'B';
    }
    return 'C';
  }

  async update(updateFoodGradeDto: UpdateFoodGradeDto) {
    this.logger.log(
      'Updating food grade with: ' + JSON.stringify(updateFoodGradeDto),
    );
    const foodGrade = await this.foodGradesRepository.findOne({
      where: { id: updateFoodGradeDto.id },
    });
    if (!foodGrade) {
      throw new Error(`Food grade with ID ${updateFoodGradeDto.id} not found`);
    }
    Object.assign(foodGrade, updateFoodGradeDto);
    return await this.foodGradesRepository.save(foodGrade);
  }

  async remove(ids: number[]) {
    this.logger.log('Removing food grades with IDs: ' + ids.join(', '));
    // Sanitize & deduplicate
    const uniqueIds = [...new Set(ids.filter((v) => typeof v === 'number'))];
    if (!uniqueIds.length) {
      this.logger.warn('Remove called with empty or invalid id list');
      return { requested: 0, affected: 0, deletedIds: [], missing: [] };
    }

    // Fetch existing to report missing ones (optional but safer feedback)
    const existing = await this.foodGradesRepository.findBy({
      id: In(uniqueIds),
    });
    const existingIds = existing.map((e) => e.id);
    const missing = uniqueIds.filter((id) => !existingIds.includes(id));

    if (!existingIds.length) {
      this.logger.warn('No matching food grades found for deletion');
      return {
        requested: uniqueIds.length,
        affected: 0,
        deletedIds: [],
        missing,
      };
    }

    const deleteResult = await this.foodGradesRepository.delete(existingIds);
    return {
      requested: uniqueIds.length,
      affected: deleteResult.affected ?? 0,
      deletedIds: existingIds,
      missing,
    };
  }

  async getGradeFromRuleBased(menu: string, geminiImageName: string) {
    try {
      const foodData = await this.api.geminiExtractFoodData(
        menu,
        undefined,
        geminiImageName,
      );
      if (!foodData) {
        throw new Error('Failed to extract food data from Gemini');
      }
      const result = this.ruleBasedGrading(foodData);
      return result;
    } catch (error) {
      this.logger.error('Error at [getGradeFromRuleBased]:', error);
      throw error;
    }
  }

  ruleBasedGrading(menu: FoodDataDto) {
    let score = 10;
    const scoring_log: ScoringLog = {} as ScoringLog;

    scoring_log['cooking_method'] = [];
    for (const cooking_method of menu.cooking_method) {
      let deduction = 0;
      switch (cooking_method) {
        case 'ทอด':
          deduction = 0;
          break;
        case 'ผัด':
          deduction = 1;
          break;
        case 'ย่าง':
          deduction = 1;
          break;
        case 'อบ':
          deduction = 1;
          break;
        case 'ต้ม':
          deduction = 0;
          break;
        case 'นึ่ง':
          deduction = 0;
          break;
        case 'ลวก':
          deduction = 0;
          break;
        case 'ดิบ':
          deduction = 0;
          break;
        case 'ยำ':
          deduction = 2;
          break;
        case 'ชุปแป้งทอด':
          deduction = 3;
          break;
        case 'ตุ๋น':
          deduction = 0;
          break;
        case 'หมัก':
          deduction = 0;
          break;
        case 'ปิ้ง':
          deduction = 1;
          break;
      }
      score -= deduction;
      scoring_log['cooking_method'].push({ method: cooking_method, deduction });
    }

    scoring_log['meat'] = menu.there_is_meat ? 0 : null;
    score -= menu.there_is_meat ? 0 : 0;

    scoring_log['vegetable'] = menu.there_is_vegetable ? 0 : null;
    score -= menu.there_is_vegetable ? 0 : 0;

    scoring_log['rice'] = [];
    if (menu.there_is_rice) {
      for (const rice of menu.rices) {
        let deduction = 0;
        switch (rice) {
          case 'ข้าวหอมมะลิ':
            deduction = 3;
            break;
          case 'ข้าวขาว':
            deduction = 4;
            break;
          case 'ข้าวเหนียว':
            deduction = 4;
            break;
          default:
            deduction = 1;
        }
        score -= deduction;
        scoring_log['rice'].push({ rice, deduction });
      }
    }

    scoring_log['noodle'] = [];
    if (menu.there_is_noodle) {
      for (const noodle of menu.noodles) {
        let deduction = 0;
        switch (noodle) {
          case 'วุ้นเส้น':
            deduction = 1;
            break;
          case 'เส้นบุก':
            deduction = 0;
            break;
          default:
            deduction = 3;
        }
        score -= deduction;
        scoring_log['noodle'].push({ noodle, deduction });
      }
    }

    scoring_log['sweet_fruit'] = menu.there_is_sweet_fruit ? 4 : null;
    if (menu.there_is_sweet_fruit) score -= 4;

    scoring_log['sweet'] = menu.there_is_sweet ? 9 : null;
    if (menu.there_is_sweet) score -= 9;

    scoring_log['drink'] = [];
    if (menu.there_is_drink) {
      for (const drink of menu.drinks) {
        let deduction = 0;
        switch (drink) {
          case 'น้ำเปล่า':
            deduction = 0;
            break;
          case 'น้ำอัดลม':
            deduction = 5;
            break;
          case 'น้ำผลไม้':
            deduction = 3;
            break;
          case 'ชา':
            deduction = 3;
            break;
          case 'กาแฟ':
            deduction = 3;
            break;
          case 'นม':
            deduction = 3;
            break;
          default:
            deduction = 1;
        }
        score -= deduction;
        scoring_log['drink'].push({ drink, deduction });
      }
    }

    scoring_log['snack'] = menu.there_is_snack ? 2 : null;
    if (menu.there_is_snack) score -= 2;

    scoring_log['sauce'] = menu.there_is_sauce ? 0.5 : null;
    if (menu.there_is_sauce) score -= 0.5;

    scoring_log['grain'] =
      menu.there_is_grain && menu.grains.length > 0 ? 1 : null;
    if (menu.there_is_grain && menu.grains.length > 0) score -= 1;

    const grade = this.scoreToGradeRulebased(score);

    return {
      grade,
      score: score >= 0 ? score : 0,
      menu_name: menu.name,
      ingredient: menu.ingredients,
      scoring_log,
      reason_description: menu.reason_description,
    };
  }

  scoreToGradeRulebased(score: number): FoodGradeType {
    if (score >= 6) return 'A';
    else if (score >= 2) return 'B';
    else return 'C';
  }
}
