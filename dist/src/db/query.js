"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = query;
const config_1 = __importDefault(require("./config"));
async function query(sql, params) {
    const [rows] = await config_1.default.query(sql, params);
    return rows;
}
