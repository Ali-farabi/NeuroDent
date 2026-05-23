import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import * as postgresStorage from "./postgres/storage.js";
import * as sqliteStorage from "./storage-sqlite.js";

const { loadEnvConfig } = nextEnv;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvConfig(path.resolve(__dirname, ".."), process.env.NODE_ENV !== "production");

const REQUESTED_STORAGE_DRIVER = String(process.env.NEURODENT_STORAGE_DRIVER || "sqlite").toLowerCase();
const ACTIVE_STORAGE = REQUESTED_STORAGE_DRIVER === "postgres" ? postgresStorage : sqliteStorage;

export function getSqliteFilePath() {
  return sqliteStorage.getSqliteFilePath();
}

export function getStorageInfo() {
  const activeInfo = ACTIVE_STORAGE.getStorageInfo();
  return {
    ...activeInfo,
    requestedDriver: REQUESTED_STORAGE_DRIVER,
    activeDriver: activeInfo.driver,
  };
}

export function checkpointDatabase() {
  return ACTIVE_STORAGE.checkpointDatabase();
}

export function initializeStore(seedSnapshot) {
  return ACTIVE_STORAGE.initializeStore(seedSnapshot);
}

export function loadDbSnapshot() {
  return ACTIVE_STORAGE.loadDbSnapshot();
}

export function persistDbSnapshot(snapshot) {
  return ACTIVE_STORAGE.persistDbSnapshot(snapshot);
}

export function createSessionRecord(session) {
  return ACTIVE_STORAGE.createSessionRecord(session);
}

export function getSessionRecord(token) {
  return ACTIVE_STORAGE.getSessionRecord(token);
}

export function deleteSessionRecord(token) {
  return ACTIVE_STORAGE.deleteSessionRecord(token);
}

export function deleteExpiredSessions(nowIso) {
  return ACTIVE_STORAGE.deleteExpiredSessions(nowIso);
}

export function listSessionRecords(options) {
  return ACTIVE_STORAGE.listSessionRecords(options);
}

export function createFileRecord(file) {
  return ACTIVE_STORAGE.createFileRecord(file);
}

export function getFileRecord(id) {
  return ACTIVE_STORAGE.getFileRecord(id);
}

export function listFileRecords(options) {
  return ACTIVE_STORAGE.listFileRecords(options);
}

export function deleteFileRecord(id) {
  return ACTIVE_STORAGE.deleteFileRecord(id);
}

export function updateFileRecordExtra(id, patch) {
  return ACTIVE_STORAGE.updateFileRecordExtra(id, patch);
}

export function createNotificationRecord(notification) {
  return ACTIVE_STORAGE.createNotificationRecord(notification);
}

export function getNotificationRecord(id) {
  return ACTIVE_STORAGE.getNotificationRecord(id);
}

export function listNotificationRecords(options) {
  return ACTIVE_STORAGE.listNotificationRecords(options);
}

export function markNotificationReadRecord(id, isRead) {
  return ACTIVE_STORAGE.markNotificationReadRecord(id, isRead);
}

export function createAuditLogRecord(entry) {
  return ACTIVE_STORAGE.createAuditLogRecord(entry);
}

export function listAuditLogRecords(options) {
  return ACTIVE_STORAGE.listAuditLogRecords(options);
}

export function upsertConversationRecord(conversation) {
  return ACTIVE_STORAGE.upsertConversationRecord(conversation);
}

export function getConversationRecord(id) {
  return ACTIVE_STORAGE.getConversationRecord(id);
}

export function listConversationRecords(options) {
  return ACTIVE_STORAGE.listConversationRecords(options);
}

export function createConversationMessageRecord(message) {
  return ACTIVE_STORAGE.createConversationMessageRecord(message);
}

export function listConversationMessageRecords(options) {
  return ACTIVE_STORAGE.listConversationMessageRecords(options);
}

export function upsertPriceItemRecord(item) {
  return ACTIVE_STORAGE.upsertPriceItemRecord(item);
}

export function getPriceItemRecord(idOrCode) {
  return ACTIVE_STORAGE.getPriceItemRecord(idOrCode);
}

export function listPriceItemRecords(options) {
  return ACTIVE_STORAGE.listPriceItemRecords(options);
}

export function setPriceItemActiveRecord(id, isActive) {
  return ACTIVE_STORAGE.setPriceItemActiveRecord(id, isActive);
}

export function createInvoiceRecord(invoice, items) {
  return ACTIVE_STORAGE.createInvoiceRecord(invoice, items);
}

export function getInvoiceRecord(id) {
  return ACTIVE_STORAGE.getInvoiceRecord(id);
}

export function listInvoiceRecords(options) {
  return ACTIVE_STORAGE.listInvoiceRecords(options);
}

export function updateInvoicePaymentRecord(id, paid, status) {
  return ACTIVE_STORAGE.updateInvoicePaymentRecord(id, paid, status);
}

export function createStockMovementRecord(movement) {
  return ACTIVE_STORAGE.createStockMovementRecord(movement);
}

export function getStockMovementRecord(id) {
  return ACTIVE_STORAGE.getStockMovementRecord(id);
}

export function listStockMovementRecords(options) {
  return ACTIVE_STORAGE.listStockMovementRecords(options);
}
