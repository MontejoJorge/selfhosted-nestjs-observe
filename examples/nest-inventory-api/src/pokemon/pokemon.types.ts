/** Shapes returned by PokéAPI (https://pokeapi.co). */

export interface PokemonResponse {
  id: number;
  name: string;
  base_experience: number;
  types: { slot: number; type: { name: string; url: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
}

export interface TypeResponse {
  name: string;
  damage_relations: Record<
    | 'double_damage_from'
    | 'half_damage_from'
    | 'no_damage_from'
    | 'double_damage_to',
    { name: string }[]
  >;
}
