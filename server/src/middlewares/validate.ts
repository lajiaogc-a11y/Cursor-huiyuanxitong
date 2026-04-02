/**
 * Zod 请求校验中间件
 * 对 body / query / params 做 schema 校验，不通过则返回 400
 */
import type { Request, Response, NextFunction } from 'express';
import { z, type ZodSchema } from 'zod';

interface ValidateOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        errors.push(...result.error.issues.map(i => `body.${i.path.join('.')}: ${i.message}`));
      } else {
        req.body = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        errors.push(...result.error.issues.map(i => `query.${i.path.join('.')}: ${i.message}`));
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        errors.push(...result.error.issues.map(i => `params.${i.path.join('.')}: ${i.message}`));
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: errors[0],
        errors,
      });
      return;
    }

    next();
  };
}

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
});

export const uuidParam = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export { z };
