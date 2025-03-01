require('dotenv').config();
const { Telegraf } = require('telegraf');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const axios = require('axios');

// Конфигурация
const BOT_TOKEN = 'token';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

// Создаем папки если их нет
[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const bot = new Telegraf(BOT_TOKEN);

// Обработчик стартовой команды
bot.start((ctx) => {
  ctx.reply(
    'Привет! Я могу конвертировать BTX файлы в PNG.\n' +
    'Просто отправь мне файл с расширением .btx',
    {
      reply_markup: {
        keyboard: [[{ text: '🚀 Конвертировать файл' }]],
        resize_keyboard: true
      }
    }
  );
});

// Обработчик документов
bot.on('document', async (ctx) => {
  try {
    const file = ctx.message.document;
    const fileName = file.file_name;
    
    // Проверка расширения файла
    if (!fileName.endsWith('.btx')) {
      return ctx.reply('❌ Пожалуйста, отправьте файл с расширением .btx');
    }

    // Получаем информацию о файле
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const filePath = path.join(UPLOAD_DIR, fileName);
    const outputPath = path.join(OUTPUT_DIR, `${path.parse(fileName).name}.png`);

    // Скачиваем файл
    const response = await axios({
      method: 'GET',
      url: fileLink,
      responseType: 'stream'
    });

    await new Promise((resolve, reject) => {
      response.data.pipe(fs.createWriteStream(filePath))
        .on('finish', resolve)
        .on('error', reject);
    });

    // Редактируем файл
    const fileData = fs.readFileSync(filePath);
    const modifiedData = fileData.subarray(4);
    const ktxPath = path.join(UPLOAD_DIR, `${path.parse(fileName).name}.ktx`);
    fs.writeFileSync(ktxPath, modifiedData);

    // Конвертируем в PNG
    await new Promise((resolve, reject) => {
      exec(
        `PVRTexToolCLI -i "${ktxPath}" -d "${outputPath}" -f r8g8b8a8`,
        (error) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });

    // Отправляем результат
    await ctx.replyWithDocument({
      source: fs.createReadStream(outputPath),
      filename: `${path.parse(fileName).name}.png`
    });

    // Удаляем временные файлы
    [filePath, ktxPath, outputPath].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });

  } catch (error) {
    console.error('Error:', error);
    ctx.reply('❌ Произошла ошибка при конвертации файла');
    
    // Удаляем временные файлы при ошибке
    [filePath, ktxPath, outputPath].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('Бот запущен!');
});

// Обработка завершения
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
