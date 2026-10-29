export class TypeMultiplierDto {
  type: string;
  /** Damage multiplier taken from attacks of this type. */
  multiplier: number;
}

export class PokemonMatchupsDto {
  id: number;
  name: string;
  types: string[];
  baseStatTotal: number;
  weaknesses: TypeMultiplierDto[];
  resistances: TypeMultiplierDto[];
  immunities: string[];
  strongAgainst: string[];
}
