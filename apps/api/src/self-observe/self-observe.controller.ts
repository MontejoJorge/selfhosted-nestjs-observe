import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SelfObserve } from './application/self-observe.service.js';
import {
  SelfObserveStatusDto,
  UpdateSelfObserveDto,
} from './self-observe.dto.js';

@ApiTags('self-observe')
@Controller('self-observe')
export class SelfObserveController {
  constructor(private readonly selfObserve: SelfObserve) {}

  @Get()
  @ApiOperation({
    operationId: 'getSelfObserve',
    summary: 'Whether the collector reports its own telemetry, and where',
  })
  @ApiOkResponse({ type: SelfObserveStatusDto })
  status(): Promise<SelfObserveStatusDto> {
    return this.selfObserve.status();
  }

  @Patch()
  @ApiOperation({
    operationId: 'updateSelfObserve',
    summary: "Turn the collector's own telemetry on or off",
    description:
      'On creates the "Observe collector (self)" project and its application when missing; no API key is ' +
      'needed. The agent reads the switch when the collector starts, so the change takes ' +
      'effect after a restart (`restartRequired`). Off stops accepting its batches at once.',
  })
  @ApiOkResponse({ type: SelfObserveStatusDto })
  @ApiConflictResponse({
    description: 'OBSERVE_APP_KEY and OBSERVE_APP_SECRET are set',
  })
  update(@Body() body: UpdateSelfObserveDto): Promise<SelfObserveStatusDto> {
    return this.selfObserve.setEnabled(body.enabled);
  }
}
