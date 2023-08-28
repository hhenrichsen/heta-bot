import { Service } from 'typedi';
import { Command } from '../../command/command';
import { PingCommand } from '../../command/ping.command';
import { JoinCommand } from '../../command/join.command';
import { FlushCommand } from '../../command/flush.command';

@Service()
export class CommandRegistry {
    private readonly commands: Map<string, Command> = new Map();

    constructor(
        pingCommand: PingCommand,
        joinCommand: JoinCommand,
        flushCommand: FlushCommand
    ) {
        const commands = [pingCommand, joinCommand, flushCommand];
        commands.forEach((command) =>
            this.commands.set(command.declaration.name, command)
        );
    }

    public getCommandDeclarations() {
        return Array.from(this.commands.values()).map(
            (command) => command.declaration
        );
    }

    public getCommand(name: string) {
        return this.commands.get(name);
    }
}
