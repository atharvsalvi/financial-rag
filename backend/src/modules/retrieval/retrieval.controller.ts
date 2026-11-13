import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RetrievalService } from './retrieval.service';
import { SearchDto } from './search.dto';

@Controller('retrieval')
export class RetrievalController {
  constructor(private readonly retrieval: RetrievalService) {}

  @Post('search')
  @HttpCode(200)
  search(@Body() body: SearchDto) {
    return this.retrieval.search(body);
  }
}
