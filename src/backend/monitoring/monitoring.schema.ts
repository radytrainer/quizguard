import { z } from "zod";

export const recordViolationSchema = z.object({
  type: z.enum(["fullscreen_exit", "tab_switch", "copy_paste"]),
});

export type RecordViolationInput = z.infer<typeof recordViolationSchema>;
