"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerStatus = exports.WorkerType = void 0;
var WorkerType;
(function (WorkerType) {
    WorkerType["GRADER_RUST"] = "grader_rust";
    WorkerType["COMPILER_FOUNDRY"] = "compiler_foundry";
    WorkerType["COMPILER_HARDHAT"] = "compiler_hardhat";
    WorkerType["COMPILER_CARGO"] = "compiler_cargo";
    WorkerType["COMPILER_MOVE"] = "compiler_move";
})(WorkerType || (exports.WorkerType = WorkerType = {}));
var WorkerStatus;
(function (WorkerStatus) {
    WorkerStatus["STARTING"] = "starting";
    WorkerStatus["READY"] = "ready";
    WorkerStatus["BUSY"] = "busy";
    WorkerStatus["STOPPING"] = "stopping";
    WorkerStatus["STOPPED"] = "stopped";
    WorkerStatus["ERROR"] = "error";
})(WorkerStatus || (exports.WorkerStatus = WorkerStatus = {}));
//# sourceMappingURL=types.js.map