import { NextResponse } from "next/server";
import { getIfsStatus } from "@/lib/ifs";

/**
 * Endpoint de estado de la integración IFS.
 *
 * Permite verificar, sin romper el sistema, si la capa de servicio IFS está
 * configurada. Los endpoints funcionales de IFS se añadirán aquí cuando se
 * disponga de la documentación de su API.
 */
export async function GET() {
  return NextResponse.json(getIfsStatus());
}
