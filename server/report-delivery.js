export const deliverReportToTelegram = async ({
  bot,
  chatId,
  pngBuffer,
  caption,
  text,
  fileName,
  logger = console,
}) => {
  let photoSent = false;
  if (pngBuffer) {
    try {
      await bot.sendPhoto(
        chatId,
        pngBuffer,
        { caption },
        { filename: fileName || 'financial-report.png', contentType: 'image/png' },
      );
      photoSent = true;
    } catch (error) {
      logger.warn?.('[bot] report image delivery failed; using text fallback', error);
    }
  }

  try {
    await bot.sendMessage(chatId, text, {
      disable_web_page_preview: true,
      parse_mode: 'Markdown',
    });
    return true;
  } catch (error) {
    logger.error?.('[bot] report text delivery failed', error);
    return photoSent;
  }
};
