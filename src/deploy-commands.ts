import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { commands } from './commands';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
  console.error('Falta DISCORD_TOKEN en .env');
  process.exit(1);
}

if (!clientId) {
  console.error('Falta DISCORD_CLIENT_ID en .env');
  process.exit(1);
}

const commandData = Array.from(commands.values()).map((cmd) => cmd.data.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

async function deploy(): Promise<void> {
  try {
    console.log(`Registrando ${commandData.length} comandos...`);

    await rest.put(Routes.applicationCommands(clientId!), { body: commandData });

    console.log('Comandos registrados globalmente');
    console.log('Nota: pueden tardar hasta 1 hora en propagarse. Para desarrollo usá guild commands.');
  } catch (error) {
    console.error('Error registrando comandos:', error);
    process.exit(1);
  }
}

deploy();
