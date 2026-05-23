import { NextResponse } from "next/server";
import { evaluateSaleReadiness } from "./sale-readiness";

const NO_STORE = { "Cache-Control": "no-store" };

export function blockPublicSaleCustomerDataAccess(): NextResponse | null {
  const readiness = evaluateSaleReadiness();
  if (readiness.mode === "public-sale" && !readiness.ready) {
    return NextResponse.json(
      { error: "Customer data controls are blocked until customer data isolation is verified." },
      { status: 503, headers: NO_STORE },
    );
  }

  return null;
}
