ALTER TABLE bot_commands DROP CONSTRAINT bot_commands_command_check;
ALTER TABLE bot_commands
  ADD CONSTRAINT bot_commands_command_check
  CHECK (command IN ('START', 'STOP', 'RESTART', 'EMERGENCY_STOP'));
