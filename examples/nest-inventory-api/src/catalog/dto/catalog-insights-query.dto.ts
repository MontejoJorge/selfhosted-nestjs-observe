import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
  IsString,
} from 'class-validator';

export class CatalogInsightsQueryDto {
  /**
   * Comma-separated DummyJSON categories. Whether each one exists is checked
   * against the upstream category list by the service.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((category) => category.trim())
          .filter(Boolean)
      : value,
  )
  @IsString({ each: true })
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  categories: string[] = ['smartphones', 'laptops', 'tablets'];

  /** `true` makes the pricing step throw, to produce an error. */
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  fail: boolean = false;
}
