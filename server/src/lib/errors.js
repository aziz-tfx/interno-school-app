export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.statusCode = status
  }
}

export const notFound = (what = 'Не найдено') => new HttpError(404, what)
export const forbidden = (what = 'Недостаточно прав') => new HttpError(403, what)
export const badRequest = (what) => new HttpError(400, what)
