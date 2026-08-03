export const deliverReportToTelegram = async ({
  bot,
  chatId,
  pngBuffer,
  fallbackText,
  fileName,
  logger = console,
}) => {
  if (pngBuffer) {
    try {
      await bot.sendPhoto(
        chatId,
        pngBuffer,
        {},
        { filename: fileName || 'financial-report.png', contentType: 'image/png' },
      );
      return true;
    } catch (error) {
      logger.warn?.('[bot] report image delivery failed; using short text fallback', error);
    }
  }

  try {
    await bot.sendMessage(chatId, fallbackText, {
      disable_web_page_preview: true,
    });
    return true;
  } catch (error) {
    logger.error?.('[bot] report fallback delivery failed', error);
    return false;
  }
};
