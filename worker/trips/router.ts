import { manageShare } from "../market/manage";
import { HttpError } from "../http";
import { requireTrip } from "./access";
import { updateTrip, deleteTrip, invite } from "./manage";
import {
  saveEvent,
  deleteEvent,
  preparation,
  reorderEvents,
  setEventStatus,
} from "./content";
import { tripData, packing } from "../data";
import {
  saveExpense,
  deleteExpense,
  settleExpense,
  reverseExpense,
} from "../finance/expenses";
import {
  addPlaceholder,
  deletePlaceholder,
  unclaimMember,
  mergePlaceholder,
} from "../finance/ledger-members";
import { uploadReceipt, deleteDraftReceipt } from "../finance/receipts";
import { tripDocument } from "../storage/trip-documents";
export async function tripRouter(
  request: Request,
  env: Env,
  memberId: string,
  parts: string[],
) {
  const [tripId, resource, id, action] = parts,
    method = request.method;
  const trip = await requireTrip(env, memberId, tripId);
  if (!resource) {
    if (method === "PUT") return updateTrip(request, env, trip, memberId);
    if (method === "DELETE") return deleteTrip(request, env, trip, memberId);
  }
  if (resource === "share" && ["GET", "POST", "DELETE"].includes(method))
    return manageShare(request, env, trip, memberId);
  if (resource === "data" && method === "GET")
    return tripData(env, memberId, trip);
  if (resource === "invites" && ["GET", "POST", "DELETE"].includes(method))
    return invite(request, env, trip, memberId);
  if (resource === "events") {
    if (method === "PATCH" && id === "order" && parts.length === 3)
      return reorderEvents(request, env, tripId);
    if (method === "PATCH" && id && parts.length === 3)
      return setEventStatus(request, env, tripId, id);
    if ((method === "POST" && !id) || (method === "PUT" && id))
      return saveEvent(request, env, tripId, memberId, id);
    if (method === "DELETE" && id) return deleteEvent(request, env, tripId, id);
  }
  if (
    resource === "preparation" &&
    ((method === "POST" && !id) ||
      ((method === "PUT" || method === "DELETE") && id))
  )
    return preparation(request, env, tripId, id);
  if (resource === "packing" && method === "PUT")
    return packing(request, env, memberId, tripId);
  if (resource === "expenses") {
    if (method === "POST" && id && action === "settle")
      return settleExpense(request, env, memberId, tripId, id);
    if (method === "POST" && id && action === "reverse")
      return reverseExpense(request, env, memberId, tripId, id);
    if ((method === "POST" && !id) || (method === "PUT" && id && !action))
      return saveExpense(request, env, memberId, tripId, id);
    if (method === "DELETE" && id && !action)
      return deleteExpense(request, env, memberId, tripId, id);
  }
  if (resource === "members") {
    if (method === "POST" && !id)
      return addPlaceholder(request, env, tripId, memberId);
    if (method === "DELETE" && id && !action)
      return deletePlaceholder(env, trip, memberId, id);
    if (method === "POST" && id && action === "unclaim")
      return unclaimMember(request, env, trip, memberId, id);
    if (method === "POST" && id && action === "merge")
      return mergePlaceholder(request, env, trip, memberId, id);
  }
  if (resource === "receipts" && id) {
    if (method === "PUT")
      return uploadReceipt(request, env, memberId, tripId, id);
    if (method === "DELETE")
      return deleteDraftReceipt(env, memberId, tripId, id);
  }
  if (
    resource === "documents" &&
    id &&
    ["PUT", "PATCH", "DELETE"].includes(method)
  )
    return tripDocument(request, env, memberId, tripId, id);
  throw new HttpError(404, "接口不存在");
}
