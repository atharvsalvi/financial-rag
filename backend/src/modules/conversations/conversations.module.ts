import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Module,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { AnswersModule } from '../answers/answers.module';
import { DatabaseModule } from '../../integrations/database/database.module';
import { ConversationsService } from './conversations.service';

class CreateConversation {
  @ValidateIf(function provided(_body: unknown, value: unknown) {
    return value !== undefined;
  })
  @IsString()
  @Matches(/\S/)
  @MaxLength(512)
  documentId?: string;
}
class AddTurn {
  @IsString() @Matches(/\S/) @MaxLength(4000) query!: string;
  @IsInt() @Min(0) version!: number;
}

@Controller('conversations')
class ConversationsController {
  constructor(private readonly chats: ConversationsService) {}
  @Post()
  create(@Body() request: CreateConversation) {
    return this.chats.create(request.documentId);
  }
  @Get(':id')
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after', new DefaultValuePipe(0), ParseIntPipe) after: number,
  ) {
    if (after < 0 || after > 2147483647)
      throw new BadRequestException(
        'after must be a nonnegative 32-bit integer.',
      );
    return this.chats.read(id, after);
  }
  @Post(':id/turns')
  append(@Param('id', ParseUUIDPipe) id: string, @Body() request: AddTurn) {
    return this.chats.append(id, request.query, request.version);
  }
}

@Module({
  imports: [DatabaseModule, AnswersModule],
  providers: [ConversationsService],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
