import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getJson, UpstreamNotFoundError } from '../common/http/get-json.js';
import {
  PokemonMatchupsDto,
  TypeMultiplierDto,
} from './dto/pokemon-matchups.dto.js';
import { PokemonResponse, TypeResponse } from './pokemon.types.js';

const POKEAPI_URL = 'https://pokeapi.co/api/v2';

@Injectable()
export class PokemonService {
  private readonly logger = new Logger(PokemonService.name);

  async getMatchups(name: string): Promise<PokemonMatchupsDto> {
    this.logger.log(`Computing matchups for ${name}`);
    const pokemon = await this.fetchPokemon(name);

    const types = await Promise.all(
      pokemon.types.map((entry) => this.fetchType(entry.type.url)),
    );

    return this.computeMatchups(pokemon, types);
  }

  private async fetchPokemon(name: string): Promise<PokemonResponse> {
    try {
      return await getJson<PokemonResponse>(
        `${POKEAPI_URL}/pokemon/${encodeURIComponent(name.toLowerCase())}`,
      );
    } catch (error) {
      if (error instanceof UpstreamNotFoundError) {
        this.logger.warn(`Unknown pokemon "${name}"`);
        throw new NotFoundException(`Pokemon "${name}" not found`);
      }
      throw error;
    }
  }

  private fetchType(url: string): Promise<TypeResponse> {
    return getJson<TypeResponse>(url);
  }

  private computeMatchups(
    pokemon: PokemonResponse,
    types: TypeResponse[],
  ): PokemonMatchupsDto {
    // Defensive multipliers stack across the pokemon's types.
    const multipliers = new Map<string, number>();
    const apply = (relation: { name: string }[], factor: number) => {
      for (const { name } of relation) {
        multipliers.set(name, (multipliers.get(name) ?? 1) * factor);
      }
    };
    for (const type of types) {
      apply(type.damage_relations.double_damage_from, 2);
      apply(type.damage_relations.half_damage_from, 0.5);
      apply(type.damage_relations.no_damage_from, 0);
    }

    const byMultiplier = (
      predicate: (value: number) => boolean,
    ): TypeMultiplierDto[] =>
      [...multipliers.entries()]
        .filter(([, value]) => predicate(value))
        .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
        .map(([type, multiplier]) => ({ type, multiplier }));

    const strongAgainst = [
      ...new Set(
        types.flatMap((type) =>
          type.damage_relations.double_damage_to.map(({ name }) => name),
        ),
      ),
    ].sort();

    const weaknesses = byMultiplier((value) => value > 1);
    this.logger.log(
      `${pokemon.name} has ${weaknesses.length} weaknesses across ${types.length} types`,
    );

    return {
      id: pokemon.id,
      name: pokemon.name,
      types: types.map((type) => type.name),
      baseStatTotal: pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0),
      weaknesses,
      resistances: byMultiplier((value) => value > 0 && value < 1),
      immunities: byMultiplier((value) => value === 0).map(({ type }) => type),
      strongAgainst,
    };
  }
}
