'use strict';

var _ = require('lodash');
var BN = require('../crypto/bn');
var BufferUtil = require('../util/buffer');
var BufferReader = require('../encoding/bufferreader');
var BufferWriter = require('../encoding/bufferwriter');
var Hash = require('../crypto/hash');
var JSUtil = require('../util/js');
var $ = require('../util/preconditions');

/**
 * Instantiate a BlockHeader from a Buffer, JSON object, or Object with
 * the properties of the BlockHeader
 *
 * @param {*} - A Buffer, JSON string, or Object
 * @returns {BlockHeader} - An instance of block header
 * @constructor
 */
var BlockHeader = function BlockHeader(arg) {
  if (!(this instanceof BlockHeader)) {
    return new BlockHeader(arg);
  }
  _.extend(this, BlockHeader._from(arg));
  return this;
};

/**
 * @param {*} - A Buffer, JSON string or Object
 * @returns {Object} - An object representing block header data
 * @throws {TypeError} - If the argument was not recognized
 * @private
 */
BlockHeader._from = function _from(arg) {
  var info = {};
  if (BufferUtil.isBuffer(arg)) {
    info = BlockHeader._fromBufferReader(BufferReader(arg));
  } else if (JSUtil.isValidJSON(arg)) {
    info = BlockHeader._fromJSON(arg);
  } else if (_.isObject(arg)) {
    info = BlockHeader._fromObject(arg);
  } else {
    throw new TypeError('Unrecognized argument for BlockHeader');
  }
  return info;
};

/**
 * @param {String} - A JSON string
 * @returns {Object} - An object representing block header data
 * @private
 */
BlockHeader._fromJSON = function _fromJSON(data) {
  $.checkArgument(JSUtil.isValidJSON(data), 'data must be a valid JSON string');
  data = JSON.parse(data);
  return BlockHeader._fromObject(data);
};

/**
 * @param {Object} - A JSON string
 * @returns {Object} - An object representing block header data
 * @private
 */
BlockHeader._fromObject = function _fromObject(data) {
  $.checkArgument(data, 'data is required');
  var prevHash = data.prevHash;
  var merkleRoot = data.merkleRoot;
  if (_.isString(data.prevHash)) {
    prevHash = BufferUtil.reverse(new Buffer(data.prevHash, 'hex'));
  }
  if (_.isString(data.merkleRoot)) {
    merkleRoot = BufferUtil.reverse(new Buffer(data.merkleRoot, 'hex'));
  }
  var info = {
    version: data.version,
    height: data.height,
    time: data.time,
    timestamp: data.time,
    bits: data.bits,
    prevHash: prevHash,
    merkleRoot: merkleRoot,
    nonce: data.nonce
  };
  return info;
};


BlockHeader.prototype.increaseNonce = function() {
  this._id = null;
  this.nonce += 1;
};

/**
 * @param {String} - A JSON string or object
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromJSON = function fromJSON(json) {
  var info = BlockHeader._fromJSON(json);
  return new BlockHeader(info);
};

/**
 * @param {Object} - A plain javascript object
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromObject = function fromObject(obj) {
  var info = BlockHeader._fromObject(obj);
  return new BlockHeader(info);
};

/**
 * @param {Buffer} - A buffer of the block header
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromBuffer = function fromBuffer(buf) {
  var info = BlockHeader._fromBufferReader(BufferReader(buf));
  return new BlockHeader(info);
};

/**
 * @param {string} - A hex encoded buffer of the block header
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromString = function fromString(str) {
  var buf = new Buffer(str, 'hex');
  return BlockHeader.fromBuffer(buf);
};


BlockHeader.create = function(data) {
  $.checkArgument(!_.isUndefined(data), 'data is required');
  $.checkArgument(!_.isUndefined(data.height), 'data.height is required');
  $.checkArgument(!_.isUndefined(data.prevHash), 'data.prevHash is required');
  data.time = data.time || Math.floor(new Date().getTime() / 1000);
  data.nonce = data.nonce || 0;
  data.bits = data.bits || BlockHeader.Constants.DEFAULT_BITS;
  return new BlockHeader({
    version: BlockHeader.Constants.CURRENT_VERSION,
    height: data.height,
    time: data.time,
    timestamp: data.time,
    bits: data.bits, 
    prevHash: data.prevHash,
    merkleRoot: data.merkleRoot,
    nonce: data.nonce
  });

};

/**
 * @param {BufferReader} - A BufferReader of the block header
 * @returns {Object} - An object representing block header data
 * @private
 */
BlockHeader._fromBufferReader = function _fromBufferReader(br) {
  var info = {};
  info.version = br.readUInt32LE();
  info.height = br.readUInt32LE();
  info.time = br.readUInt32LE();
  info.bits = br.readUInt32LE();
  info.prevHash = br.read(32);
  info.merkleRoot = br.read(32);
  info.nonce = br.readUInt32LE();
  return info;
};

/**
 * @param {BufferReader} - A BufferReader of the block header
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromBufferReader = function fromBufferReader(br) {
  var info = BlockHeader._fromBufferReader(br);
  return new BlockHeader(info);
};

/**
 * @returns {Object} - A plain object of the BlockHeader
 */
BlockHeader.prototype.toObject = function toObject() {
  return {
    version: this.version,
    height: this.height,
    time: this.time,
    bits: this.bits,
    prevHash: BufferUtil.reverse(this.prevHash).toString('hex'),
    merkleRoot: BufferUtil.reverse(this.merkleRoot).toString('hex'),
    nonce: this.nonce
  };
};

/**
 * @returns {string} - A JSON string
 */
BlockHeader.prototype.toJSON = function toJSON() {
  return JSON.stringify(this.toObject());
};

/**
 * @returns {Buffer} - A Buffer of the BlockHeader
 */
BlockHeader.prototype.toBuffer = function toBuffer() {
  return this.toBufferWriter().concat();
};

/**
 * @returns {string} - A hex encoded string of the BlockHeader
 */
BlockHeader.prototype.toString = function toString() {
  return this.toBuffer().toString('hex');
};

/**
 * @param {BufferWriter} - An existing instance BufferWriter
 * @returns {BufferWriter} - An instance of BufferWriter representation of the BlockHeader
 */
BlockHeader.prototype.toBufferWriter = function toBufferWriter(bw) {
  if (!bw) {
    bw = new BufferWriter();
  }
  bw.writeUInt32LE(this.version);
  bw.writeUInt32LE(this.height);
  bw.writeUInt32LE(this.time);
  bw.writeUInt32LE(this.bits);
  bw.write(this.prevHash);
  bw.write(this.merkleRoot);
  bw.writeUInt32LE(this.nonce);
  return bw;
};

/**
 * @link https://en.bitcoin.it/wiki/Difficulty
 * @returns {BN} - An instance of BN with the decoded difficulty bits
 */
BlockHeader.prototype.getTargetDifficulty = function getTargetDifficulty() {
  return BlockHeader.getTargetDifficulty(this.bits);
};

BlockHeader.getTargetDifficulty = function(bits) {
  $.checkArgument(_.isNumber(bits), 'bits must be a number');
  var target = new BN(bits & 0xffffff);
  var mov = 8 * ((bits >>> 24) - 3);
  while (mov-- > 0) {
    target = target.mul(new BN(2));
  }
  return target;

};

BlockHeader.getBits = function(difficulty) {
  $.checkArgument(difficulty instanceof BN, 'difficulty must be a BN');
 
  // TODO 

};

/**
 * @returns {Buffer} - The little endian hash buffer of the header
 */
BlockHeader.prototype.getHash = function hash() {
  var buf = this.toBuffer();
  return Hash.sha256sha256(buf);
};

var idProperty = {
  configurable: false,
  enumerable: true,
  /**
   * @returns {string} - The big endian hash buffer of the header
   */
  get: function() {
    if (!this._id) {
      this._id = BufferReader(this.getHash()).readReverse().toString('hex');
    }
    return this._id;
  },
  set: _.noop
};
Object.defineProperty(BlockHeader.prototype, 'id', idProperty);
Object.defineProperty(BlockHeader.prototype, 'hash', idProperty);

/**
 * @returns {Boolean} - If timestamp is not too far in the future
 */
BlockHeader.prototype.validTimestamp = function validTimestamp() {
  var currentTime = Math.round(new Date().getTime() / 1000);
  if (this.time > currentTime + BlockHeader.Constants.MAX_TIME_OFFSET) {
    return false;
  }
  return true;
};

/**
 * @returns {Boolean} - If the proof-of-work hash satisfies the target difficulty
 */
BlockHeader.prototype.validProofOfWork = function validProofOfWork() {
  var pow = new BN(this.id, 'hex');
  var target = this.getTargetDifficulty();

  if (pow.cmp(target) > 0) {
    return false;
  }
  return true;
};

/**
 * @returns {string} - A string formated for the console
 */
BlockHeader.prototype.inspect = function inspect() {
  return '<BlockHeader ' + this.id + '>';
};

BlockHeader.Constants = {
  CURRENT_VERSION: 1,
  DEFAULT_BITS: 0x207fffff,
  START_OF_HEADER: 8, // Start buffer position in raw block data
  MAX_TIME_OFFSET: 2 * 60 * 60, // The max a timestamp can be in the future
  LARGEST_HASH: new BN('10000000000000000000000000000000000000000000000000000000000000000', 'hex')
};

module.exports = BlockHeader;
