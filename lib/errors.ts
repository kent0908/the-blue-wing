import { NextResponse } from "next/server";
import { SirayaApiError, SirayaConfigError } from "./siraya";

/** Turn any thrown error into the documented SIRAYA error envelope. */
export function errorResponse(err: unknown) {
  if (err instanceof SirayaConfigError) {
    return NextResponse.json(
      { error: { message: err.message, type: "configuration_error", code: "missing_api_key" } },
      { status: 500 }
    );
  }
  if (err instanceof SirayaApiError) {
    return NextResponse.json(
      { error: { message: err.message, type: err.type, code: err.code } },
      { status: err.status }
    );
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json(
    { error: { message, type: "internal_server_error", code: 500 } },
    { status: 500 }
  );
}
