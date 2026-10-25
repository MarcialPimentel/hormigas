export class GameError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new GameError('not_found', what, 404);
export const forbidden = () => new GameError('forbidden', 'Not yours.', 403);
