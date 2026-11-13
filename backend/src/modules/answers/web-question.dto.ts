import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class WebQuestionDto {
  @IsString() @Matches(/\S/) @MaxLength(400) query!: string;
  @IsInt() @Min(1) @Max(5) topK = 3;
}
