import winston from 'winston'

class Logger {
  private static instance: winston.Logger

  private constructor() {}

  public static getInstance(): winston.Logger {
    if (!Logger.instance) {
      const consoleFormat = winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.printf(({ timestamp, level, message, ...metadata }) => {
          return `${timestamp} ${level} ${message} ${JSON.stringify(metadata, null, 0)}`
        }),
      )

      Logger.instance = winston.createLogger({
        level: 'info',
        format: winston.format.json(),
        transports: [new winston.transports.Console({ format: consoleFormat })],
      })
    }

    return Logger.instance
  }
}

export const logger = Logger.getInstance()
