import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateChecker } from './application/update-checker.js';
import { UpdateSettingsDto, UpdateStatusDto } from './updates.dto.js';

const OFF = 'UPDATE_CHECK=false, or the check is turned off';

@ApiTags('updates')
@Controller('updates')
export class UpdatesController {
  constructor(private readonly checker: UpdateChecker) {}

  @Get()
  @ApiOperation({
    operationId: 'getUpdateStatus',
    summary:
      'Running version, the latest release found on GitHub and whether the check is on',
    description:
      'The API looks up the latest GitHub release every 6 hours while the check is on; ' +
      'this route only reads the stored result.',
  })
  @ApiOkResponse({ type: UpdateStatusDto })
  status(): Promise<UpdateStatusDto> {
    return this.checker.status();
  }

  @Patch('settings')
  @ApiOperation({
    operationId: 'updateUpdateSettings',
    summary: 'Turn the update check on or off',
    description:
      'Turning it on looks up the latest release right away when the last check is 6 hours old.',
  })
  @ApiOkResponse({ type: UpdateStatusDto })
  @ApiConflictResponse({ description: 'UPDATE_CHECK=false' })
  updateSettings(@Body() body: UpdateSettingsDto): Promise<UpdateStatusDto> {
    return this.checker.setEnabled(body.enabled);
  }

  @Post('check')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'checkForUpdates',
    summary: 'Look up the latest release now',
    description:
      'A failed lookup is not an error of this route: it is reported in `error`.',
  })
  @ApiOkResponse({ type: UpdateStatusDto })
  @ApiConflictResponse({ description: OFF })
  checkNow(): Promise<UpdateStatusDto> {
    return this.checker.checkNow();
  }
}
