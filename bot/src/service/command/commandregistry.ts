import { Service } from 'typedi';
import { Command } from '../../command/command';
import { PingCommand } from '../../command/ping.command';
import { JoinCommand } from '../../command/join.command';

@Service()
export class CommandRegistry {
    private readonly commands: Map<string, Command> = new Map();

    constructor(pingCommand: PingCommand, joinCommand: JoinCommand) {
        const commands = [pingCommand, joinCommand];
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
