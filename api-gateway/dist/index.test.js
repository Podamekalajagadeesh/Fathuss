"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const index_1 = __importDefault(require("../src/index"));
describe('API Gateway', () => {
    it('should return health check', async () => {
        const response = await (0, supertest_1.default)(index_1.default).get('/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('OK');
    });
    it('should return 401 for protected route without token', async () => {
        const response = await (0, supertest_1.default)(index_1.default).get('/protected');
        expect(response.status).toBe(401);
    });
});
