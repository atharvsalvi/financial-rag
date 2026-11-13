import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SearchDto {
  @IsString()
  @Matches(/\S/, { message: 'query must contain text' })
  @MaxLength(4000)
  query!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  topK = 5;

  @ValidateIf(function supplied(_body: SearchDto, value: unknown) {
    return value !== undefined;
  })
  @IsString()
  @Matches(/\S/)
  @MaxLength(512)
  documentId?: string;
}
