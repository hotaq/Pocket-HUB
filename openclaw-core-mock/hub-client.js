"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawHubClient = void 0;
var socket_io_client_1 = require("socket.io-client");
var axios_1 = require("axios");
var OpenClawHubClient = /** @class */ (function () {
    function OpenClawHubClient(hubUrl) {
        if (hubUrl === void 0) { hubUrl = 'http://localhost:3000'; }
        this.socket = null;
        this.token = null;
        this.hubUrl = hubUrl;
    }
    OpenClawHubClient.prototype.register = function (name, capabilities) {
        return __awaiter(this, void 0, void 0, function () {
            var res, e_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, axios_1.default.post("".concat(this.hubUrl, "/auth/register"), { name: name, capabilities: capabilities })];
                    case 1:
                        res = _b.sent();
                        console.log("Registered agent ".concat(res.data.name, " with token: ").concat(res.data.token));
                        return [2 /*return*/, res.data];
                    case 2:
                        e_1 = _b.sent();
                        console.error('Registration failed:', ((_a = e_1.response) === null || _a === void 0 ? void 0 : _a.data) || e_1.message);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    OpenClawHubClient.prototype.authenticate = function (name, token) {
        return __awaiter(this, void 0, void 0, function () {
            var res, e_2;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, axios_1.default.post("".concat(this.hubUrl, "/auth/login"), { name: name, token: token })];
                    case 1:
                        res = _b.sent();
                        this.token = res.data.access_token;
                        return [2 /*return*/, true];
                    case 2:
                        e_2 = _b.sent();
                        console.error('Authentication failed:', ((_a = e_2.response) === null || _a === void 0 ? void 0 : _a.data) || e_2.message);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    OpenClawHubClient.prototype.connectWebSocket = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this.token)
                    throw new Error('Must authenticate first');
                this.socket = (0, socket_io_client_1.io)(this.hubUrl, {
                    auth: { token: "Bearer ".concat(this.token) }
                });
                this.socket.on('connect', function () {
                    console.log('Connected to OpenClaw Community Hub!');
                });
                this.socket.on('disconnect', function () {
                    console.log('Disconnected from Hub');
                });
                // Listen for incoming broadcasted collaboration requests
                this.socket.on('broadcast', function (data) {
                    if (data.type === 'request-help') {
                        console.log("\n[Broadcast] Agent ".concat(data.senderId, " needs help: ").concat(data.taskDescription));
                        console.log("Requires capabilities: ".concat(data.requiredCapabilities.join(', ')));
                        // Here the local agent AI would decide to respond or ignore
                    }
                });
                this.socket.on('direct-message', function (data) {
                    console.log("\n[Direct Message] From ".concat(data.senderId, ":"), data.payload);
                });
                return [2 /*return*/];
            });
        });
    };
    OpenClawHubClient.prototype.searchResources = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var res, e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, axios_1.default.get("".concat(this.hubUrl, "/api/resources/search?q=").concat(query))];
                    case 1:
                        res = _a.sent();
                        return [2 /*return*/, res.data];
                    case 2:
                        e_3 = _a.sent();
                        console.error('Search failed:', e_3.message);
                        return [2 /*return*/, []];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    OpenClawHubClient.prototype.broadcastRequestForHelp = function (taskDescription, requiredCapabilities) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this.socket)
                    throw new Error('Not connected');
                this.socket.emit('request-help', { taskDescription: taskDescription, requiredCapabilities: requiredCapabilities });
                return [2 /*return*/];
            });
        });
    };
    OpenClawHubClient.prototype.disconnect = function () {
        if (this.socket)
            this.socket.disconnect();
    };
    return OpenClawHubClient;
}());
exports.OpenClawHubClient = OpenClawHubClient;
