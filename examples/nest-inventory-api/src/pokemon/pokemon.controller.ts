import { Controller, Get, Param } from '@nestjs/common';
import { PokemonMatchupsDto } from './dto/pokemon-matchups.dto.js';
import { PokemonService } from './pokemon.service.js';

@Controller('pokemon')
export class PokemonController {
  constructor(private readonly pokemonService: PokemonService) {}

  /** Type weaknesses, resistances and immunities of a pokemon. */
  @Get(':name/matchups')
  getMatchups(@Param('name') name: string): Promise<PokemonMatchupsDto> {
    return this.pokemonService.getMatchups(name);
  }
}
