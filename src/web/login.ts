import { Router } from 'express';
export const loginRouter = Router();
loginRouter.get('/', (_req, res) => res.redirect('/'));
