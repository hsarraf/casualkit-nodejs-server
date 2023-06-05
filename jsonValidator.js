"use strict"

const Ajv = require("ajv")
const ajv = new Ajv();

const createRoomSchema = {
  type: "object",
  properties: {
    n_: {type: "string"},
    c_: {type: "integer"},
  }, additionalProperties: false, required: ["n_", "c_"]
}

const joinRoomSchema = {
  type: "object",
  properties: {
    n_: {type: "string"},
  }, additionalProperties: false, required: ["n_"]
}

const createRoomValidator = ajv.compile(createRoomSchema);
const joinRoomValidator = ajv.compile(joinRoomSchema);

exports.validateCreatRoom = json => createRoomValidator(json);
exports.validateJoinRoom = json => joinRoomValidator(json);
