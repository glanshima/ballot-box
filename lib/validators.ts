import { z } from 'zod';

const isoDate = z
  .string({ required_error: 'Date is required.' })
  .datetime({ offset: true, message: 'Invalid date.' })
  .transform((s) => new Date(s));

export const dateSchema = isoDate;

const optText =(max: number) => z.string().trim().max(max).optional();

export const electionSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(200),
    description: optText(5000),
    type: z.enum(['candidate', 'poll']),
    requireImages: z.boolean(),
    opensAt: isoDate,
    closesAt: isoDate,
    nominationsEnabled: z.boolean(),
    nominationsCloseAt: isoDate.optional(),
    nominationPositions: z.array(z.string().trim().min(1).max(100)).max(30),
    requirePurchaseEvidence: z.boolean(),
    nominationInstructions: optText(2000),
    liveResults: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.closesAt > v.opensAt, { message: 'Closing time must be after the opening time.', path: ['closesAt'] });

export const optionSchema = z
  .object({
    label: z.string().trim().min(1, 'Name / label is required.').max(200),
    description: optText(1000),
    position: optText(100),
    imageUrl: z.string().url().max(1000).optional(),
    imagePath: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => !!v.imageUrl === !!v.imagePath, { message: 'Invalid image.' });

export const voterSchema = z
  .object({ email: z.string().trim().toLowerCase().email('Enter a valid email.').max(254), name: optText(200) })
  .strict();

export const adminCreateSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required.').max(100),
    email: z.string().trim().toLowerCase().email('Enter a valid email.').max(254),
    password: z.string().min(10, 'Password must be at least 10 characters.').max(200),
  })
  .strict();

export const passwordSchema = z.string().min(10, 'Password must be at least 10 characters.').max(200);

export const choiceSchema = z.object({ position: z.string().max(200).nullable(), optionId: z.string().uuid().nullable() }).strict();

export const voteSchema = z
  .object({ token: z.string().min(20).max(100), choices: z.array(choiceSchema).min(1).max(100) })
  .strict();

export const nominationSchema = z
  .object({
    electionId: z.string().uuid(),
    fullName: z.string().trim().min(2, 'Full name is required.').max(200),
    email: z.string().trim().toLowerCase().email('Enter a valid email.').max(254),
    phone: optText(40),
    position: optText(100),
    manifesto: optText(1500),
    photoUrl: z.string().url().max(1000),
    photoPath: z.string().max(500),
    receiptUrl: z.string().url().max(1000).optional(),
    receiptPath: z.string().max(500).optional(),
    receiptReference: optText(100),
  })
  .strict()
  .refine((v) => !!v.receiptUrl === !!v.receiptPath, { message: 'Invalid receipt upload.' });

export type Choice = z.infer<typeof choiceSchema>;
