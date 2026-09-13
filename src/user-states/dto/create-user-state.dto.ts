import { MealType } from 'src/meals/entities/meal.entity';
import { User } from 'src/users/entities/user.entity';
import { FoodGradingInfo } from 'src/user-states/entities/user-state.entity';
import * as line from '@line/bot-sdk';

export class CreateUserStateDto {
  user: User;
  state: string;
  menuName?: { name: string[] }[] | null;
  pendingFile?: { fileName: string; filePath: string } | null;
  mealType?: MealType;
  messageToSend?:
    | line.messagingApi.TextMessage
    | line.messagingApi.ImageMessage
    | line.messagingApi.FlexMessage;
  lineUserId?: string;
  geminiImageName?: string;
  foodGradingInfo?: FoodGradingInfo | null;
}
