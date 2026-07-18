"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST || (process.env.NODE_ENV === 'production' ? '68.178.198.174' : 'localhost'),
    port: 3306,
    user: 'myclubadmin',
    password: 'MyS0nisaPilot',
    database: 'myclubgolf',
});
exports.default = pool;
