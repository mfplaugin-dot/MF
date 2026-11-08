import type { Catalog } from "./api";

export const SALES_CONFIG: { currency: string; whatsappNumber: string; whatsappDisplayNumber: string; plans: Catalog["plans"] } = {
  currency: "EGP",
  whatsappNumber: "201016022870",
  whatsappDisplayNumber: "01016022870",
  plans: [
    { id: "monthly", price: 350, deviceLimit: 1, durationDays: 30 },
    { id: "lifetime", price: 1500, deviceLimit: 1, durationDays: null }
  ]
};
