import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { UpdateVotingEndDto } from './dto/update-voting-end.dto';
import { UpdateVotingSettingsDto } from './dto/update-voting-settings.dto';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  login(@Body() dto: AdminLoginDto) {
    return this.adminService.login(dto);
  }

  @Get('summary')
  @UseGuards(AuthGuard('jwt'))
  summary() {
    return this.adminService.summary();
  }

  @Patch('voting-end')
  @UseGuards(AuthGuard('jwt'))
  updateVotingEnd(@Body() dto: UpdateVotingEndDto) {
    return this.adminService.updateVotingEndsAt(dto.votingEndsAt);
  }

  @Patch('voting-settings')
  @UseGuards(AuthGuard('jwt'))
  updateVotingSettingsPatch(@Body() dto: UpdateVotingSettingsDto) {
    return this.adminService.updateMagicLinkRequired(dto.magicLinkRequired);
  }

  @Post('voting-settings/magic-link')
  @UseGuards(AuthGuard('jwt'))
  updateVotingSettings(@Body() dto: UpdateVotingSettingsDto) {
    return this.adminService.updateMagicLinkRequired(dto.magicLinkRequired);
  }

  @Post('universities')
  @UseGuards(AuthGuard('jwt'))
  createUniversity(@Body() dto: CreateUniversityDto) {
    return this.adminService.createUniversity(dto.name);
  }

  @Patch('universities/:id')
  @UseGuards(AuthGuard('jwt'))
  renameUniversityPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUniversityDto,
  ) {
    return this.adminService.renameUniversity(id, dto.name);
  }

  /** POST alias — more reliable than PATCH behind some browsers/proxies */
  @Post('universities/:id/rename')
  @UseGuards(AuthGuard('jwt'))
  renameUniversity(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUniversityDto,
  ) {
    return this.adminService.renameUniversity(id, dto.name);
  }

  @Delete('universities/:id')
  @UseGuards(AuthGuard('jwt'))
  deleteUniversity(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteUniversity(id);
  }

  @Get('export.xlsx')
  @UseGuards(AuthGuard('jwt'))
  async export(@Res() res: Response) {
    const buffer = await this.adminService.exportExcel();
    const filename = `abg-fan-cup-votes-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
