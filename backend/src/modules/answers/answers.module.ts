import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { OllamaAnswerService } from '../../integrations/ollama/ollama-answer.service';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { SearchDto } from '../retrieval/search.dto';
import { AnswerService } from './answer.service';
import { TavilySearchService } from '../../integrations/tavily/tavily-search.service';
import { WebQuestionDto } from './web-question.dto';

@Controller('answers')
class AnswersController {
  constructor(private readonly answers: AnswerService) {}
  @Post()
  @HttpCode(200)
  answer(@Body() request: SearchDto) {
    return this.answers.answer(request);
  }
  @Post('web')
  @HttpCode(200)
  web(@Body() request: WebQuestionDto) {
    return this.answers.answerWeb(request);
  }
}

@Module({
  imports: [RetrievalModule],
  controllers: [AnswersController],
  providers: [AnswerService, OllamaAnswerService, TavilySearchService],
  exports: [AnswerService],
})
export class AnswersModule {}
