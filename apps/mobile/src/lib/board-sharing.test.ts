import { describe, expect, it } from "vitest";
import { notificationTarget, shareNoticeFor } from "./board-sharing";

const request = (status: "PENDING" | "APPROVED" | "REJECTED", reason: string | null = null) => ({
  id: "r1",
  status,
  reason,
  createdAt: "2026-10-07T10:00:00.000Z",
  decidedAt: status === "PENDING" ? null : "2026-10-07T11:00:00.000Z",
});

describe("shareNoticeFor", () => {
  it("tells the owner a request is waiting", () => {
    expect(shareNoticeFor({ kind: "PERSONAL", ownerId: "me", shareRequest: request("PENDING") }, "me")).toEqual({
      kind: "pending",
    });
  });

  it("tells the owner why it was rejected", () => {
    expect(
      shareNoticeFor({ kind: "PERSONAL", ownerId: "me", shareRequest: request("REJECTED", "توجد لوحة: الهدي") }, "me"),
    ).toEqual({ kind: "rejected", reason: "توجد لوحة: الهدي" });
  });

  it("says nothing to anyone but the owner", () => {
    expect(shareNoticeFor({ kind: "PERSONAL", ownerId: "me", shareRequest: request("PENDING") }, "someone")).toBeNull();
    expect(shareNoticeFor({ kind: "PERSONAL", ownerId: "me", shareRequest: request("PENDING") }, undefined)).toBeNull();
  });

  it("says nothing once shared, or when no request was ever made", () => {
    expect(shareNoticeFor({ kind: "SHARED", ownerId: "me", shareRequest: request("APPROVED") }, "me")).toBeNull();
    expect(shareNoticeFor({ kind: "PERSONAL", ownerId: "me", shareRequest: null }, "me")).toBeNull();
  });
});

describe("notificationTarget", () => {
  it("opens the card for card notifications", () => {
    expect(notificationTarget({ type: "ASSIGNED", cardId: "c1", boardId: "b1" })).toEqual({
      kind: "card",
      cardId: "c1",
      boardId: "b1",
    });
  });

  it("sends a share request to the approver queue", () => {
    expect(notificationTarget({ type: "BOARD_SHARE_REQUESTED", cardId: "", boardId: "b1" })).toEqual({
      kind: "board-requests",
    });
  });

  it("opens the board for a share decision", () => {
    expect(notificationTarget({ type: "BOARD_SHARE_APPROVED", cardId: "", boardId: "b1" })).toEqual({
      kind: "board",
      boardId: "b1",
    });
    expect(notificationTarget({ type: "BOARD_SHARE_REJECTED", cardId: null, boardId: "b1" })).toEqual({
      kind: "board",
      boardId: "b1",
    });
  });

  it("does nothing for a push from an older server without a type or card", () => {
    expect(notificationTarget({ cardId: "", boardId: "b1" })).toBeNull();
    expect(notificationTarget({})).toBeNull();
  });
});
