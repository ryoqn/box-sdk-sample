export interface BoxApiError extends Error {
  error?: Error
  responseInfo?: {
    body: {
      status: number
      code: string
      message: string
    }
  }
}
