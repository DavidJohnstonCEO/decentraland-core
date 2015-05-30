'use strict';

var _ = require('lodash');
var $ = require('../util/preconditions');
var buffer = require('buffer');

var errors = require('../errors');
var BufferUtil = require('../util/buffer');
var JSUtil = require('../util/js');
var BufferReader = require('../encoding/bufferreader');
var BufferWriter = require('../encoding/bufferwriter');
var Hash = require('../crypto/hash');
var Signature = require('../crypto/signature');
var Sighash = require('./sighash');

var PrivateKey = require('../privatekey');
var PublicKey = require('../publickey');


/**
 *
 * @param {*} serialized
 * @constructor
 */
function Transaction(serialized) {
  if (!(this instanceof Transaction)) {
    return new Transaction(serialized);
  }
  if (serialized) {
    if (serialized instanceof Transaction) {
      return Transaction.shallowCopy(serialized);
    } else if (JSUtil.isHexa(serialized)) {
      this.fromString(serialized);
    } else if (JSUtil.isValidJSON(serialized)) {
      this.fromJSON(serialized);
    } else if (BufferUtil.isBuffer(serialized)) {
      this.fromBuffer(serialized);
    } else if (_.isObject(serialized)) {
      this.fromObject(serialized);
    } else {
      throw new errors.InvalidArgument('Must provide an object or string to deserialize a transaction');
    }
  } else {
    this._newTransaction();
  }
}

Transaction.CURRENT_VERSION = 1;

/* Constructors and Serialization */

/**
 * Create a 'shallow' copy of the transaction, by serializing and deserializing
 *
 * @param {Transaction} transaction
 * @return {Transaction}
 */
Transaction.shallowCopy = function(transaction) {
  var copy = new Transaction(transaction.toBuffer());
  return copy;
};

var hashProperty = {
  configurable: false,
  enumerable: true,
  get: function() {
    return new BufferReader(this.getHash()).readReverse().toString('hex');
  }
};
Object.defineProperty(Transaction.prototype, 'hash', hashProperty);
Object.defineProperty(Transaction.prototype, 'id', hashProperty);

/**
 * Retrieve the little endian hash of the transaction (used for serialization)
 * @return {Buffer}
 */
Transaction.prototype.getHash = function() {
  return Hash.sha256sha256(this.toBuffer());
};

/**
 * Retrieve a hexa string that can be used with bitcoind's CLI interface
 * (decoderawtransaction, sendrawtransaction)
 *
 * @param {Object|boolean=} unsafe if true, skip all tests. if it's an object,
 *   it's expected to contain a set of flags to skip certain tests:
 * * `disableAll`: disable all checks
 * @return {string}
 */
Transaction.prototype.serialize = function(unsafe) {
  if (true === unsafe || unsafe && unsafe.disableAll) {
    return this.uncheckedSerialize();
  } else {
    return this.checkedSerialize(unsafe);
  }
};

Transaction.prototype.uncheckedSerialize = Transaction.prototype.toString = function() {
  return this.toBuffer().toString('hex');
};

/**
 * Retrieve a hexa string that can be used with bitcoind's CLI interface
 * (decoderawtransaction, sendrawtransaction)
 *
 * @param {Object} opts allows to skip certain tests. {@see Transaction#serialize}
 * @return {string}
 */
Transaction.prototype.checkedSerialize = function(opts) {
  var serializationError = this.getSerializationError(opts);
  if (serializationError) {
    serializationError.message += ' Use Transaction#uncheckedSerialize if you want to skip security checks. ' +
      'See http://bitcore.io/guide/transaction.html#Serialization for more info.';
    throw serializationError;
  }
  return this.uncheckedSerialize();
};

/**
 * Retrieve a possible error that could appear when trying to serialize and
 * broadcast this transaction.
 *
 * @param {Object} opts allows to skip certain tests. {@see Transaction#serialize}
 * @return {bitcore.Error}
 */
Transaction.prototype.getSerializationError = function(opts) {
  opts = opts || {};
  return this._isMissingSignatures(opts);
};

Transaction.prototype._isMissingSignatures = function(opts) {
  if (opts.disableIsFullySigned) {
    return;
  }
  if (!this.isFullySigned()) {
    return new errors.Transaction.MissingSignatures();
  }
};

Transaction.prototype.inspect = function() {
  return '<Transaction: ' + this.uncheckedSerialize() + '>';
};

Transaction.prototype.toBuffer = function() {
  return this.toBufferWriter().toBuffer();
};

Transaction.prototype.toBufferWriter = function(writer) {
  if (!writer) {
    writer = new BufferWriter();
  }
  writer.writeUInt8(this.version);
  writer.write(this.input);
  writer.writeInt32LE(this.position.x);
  writer.writeInt32LE(this.position.y);
  writer.writeUInt32LE(this.color);
  if (this.owner) {
    this.owner.toBufferWriter(writer);
  }
  if (this.signature) {
    var signature = this.signature.toBuffer();
    writer.writeUInt8(signature.length);
    writer.write(signature);
  } else {
    writer.writeUInt8(0);
  }
  return writer;
};

Transaction.prototype.fromBuffer = function(buffer) {
  var reader = new BufferReader(buffer);
  return this.fromBufferReader(reader);
};

Transaction.prototype.fromBufferReader = function(reader) {
  $.checkArgument(!reader.finished(), 'No transaction data received');
  this.version = reader.readUInt8();
  this.input = reader.read(32);
  this.position = {};
  this.position.x = reader.readInt32LE();
  this.position.y = reader.readInt32LE();
  this.color = reader.readUInt32LE();
  this.owner = PublicKey.fromBufferReader(reader);
  var signature = reader.readUInt8();
  if (signature) {
    this.signature = Signature.fromBuffer(reader.read(signature));
  }

  return this;
};

Transaction.prototype.fromJSON = function(json) {
  if (JSUtil.isValidJSON(json)) {
    json = JSON.parse(json);
  }
  return this.fromObject(json);
};

Transaction.prototype.toObject = function toObject() {
  var obj = {
    version: this.version,
    input: this.input.toString('hex'),
    position: {
      x: this.position.x,
      y: this.position.y
    },
    color: this.color,
    owner: this.owner.toObject(),
  };
  return obj;
};

Transaction.prototype.fromObject = function(transaction) {
  if (transaction instanceof Transaction) {
    transaction = transaction.toObject();
  }
  this.version = transaction.version;
  this.input = new Buffer(transaction.input, 'hex');
  this.position = transaction.position;
  this.color = transaction.color;
  this.owner = PublicKey.fromObject(transaction.owner);
  this._checkConsistency();
  return this;
};

Transaction.prototype._checkConsistency = function() {};

Transaction.prototype.toJSON = function toJSON() {
  return JSON.stringify(this.toObject());
};

Transaction.prototype.fromString = function(string) {
  this.fromBuffer(new buffer.Buffer(string, 'hex'));
};

Transaction.prototype._newTransaction = function() {
  this.version = Transaction.CURRENT_VERSION;
  this.input = BufferUtil.NULL_HASH;
  this.position = {
    x: 0,
    y: 0
  };
  this.color = 0;
  this.owner = null;
};

/* Transaction creation interface */

/**
 *
 * @param {Object} txid 
 */
Transaction.prototype.from = function(tx) {
  if (_.isString(tx)) {
    this.input = new Buffer(tx, 'hex');
    return this;
  }
  $.checkArgument(tx instanceof Transaction, 'tx is a required Transaction');
  this.position = {
    x: tx.position.x,
    y: tx.position.y
  };
  this._previous = tx;
  this.input = new Buffer(tx.id, 'hex');
  return this;
};

/**
 * Add an output to the transaction.
 *
 * @param {string|PublicKey} owner
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.to = function(owner) {
  if (_.isString(owner)) {
    owner = new PublicKey(owner);
  }
  $.checkArgument(owner instanceof PublicKey, 'owner is required and must be a PublicKey');
  this.owner = owner;
  return this;
};

Transaction.prototype.colored = function(color) {
  if (_.isString(color)) {
    color = parseInt(color);
  }
  $.checkArgument(color, 'color is required');
  $.checkArgument(0 <= color && color <= 0xffffffff, 'color needs to be between 0 and 0xffffffff (0xrrggbbaa)');
  this.color = color;
  return this;
};

Transaction.prototype.at = function(x, y) {
  $.checkState(!this._previous, 'Can not set position if a previous transaction was set');
  $.checkArgument(_.isNumber(x), 'x is a required integer');
  $.checkArgument(_.isNumber(y), 'y is a required integer');
  this.position.x = x;
  this.position.y = y;
  return this;
};


Transaction.prototype._clearSignatures = function() {
  this.signature = null;
};

/* Signature handling */

/**
 * Sign the transaction using one or more private keys.
 *
 * @param {Array|String|PrivateKey} privateKey
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.sign = function(privateKey) {
  var self = this;
  if (_.isArray(privateKey)) {
    var keys = privateKey;
    _.each(keys, function(pk) {
      self.sign(pk);
    });
    return this;
  }
  var sig = this.getSignature(privateKey);
  self.applySignature(sig);
  return this;
};

Transaction.prototype.getSignature = function(privateKey) {
  privateKey = new PrivateKey(privateKey);
  var transaction = this;
  return Sighash.sign(transaction, privateKey);
};

/**
 * Add a signature to the transaction
 *
 * @param {Signature} signature
 * @return {Transaction} this, for chaining
 */
Transaction.prototype.applySignature = function(signature) {
  $.checkArgument(signature, 'signature is required');
  $.checkArgument(this.isValidSignature(signature), 'invalid signature for this transaction');
  this.signature = signature;
  return this;
};

Transaction.prototype.isFullySigned = function() {
  return !!this.signature;
};

Transaction.prototype.isValidSignature = function(signature) {
  $.checkState(this._previous instanceof Transaction, 'No previous transaction information, cannot validate signature');
  $.checkState(this._previous.owner instanceof PublicKey, 'Previous transaction has invalid owner');
  $.checkArgument(signature instanceof Signature, 'signature must be a Signature');
  return Sighash.verify(this, signature, this._previous.owner);
};

Transaction.prototype.isCoinbase = function() {
  return this.input === BufferUtil.NULL_HASH;
};

// returns first adjacent coord found, or false if none is adjacent
Transaction.prototype.isAdjacent = function(coords) {
  $.checkState(this.hasPosition(), 'Transaction needs to have position to check adjacency');
  $.checkArgument(_.isArray(coords), 'coords must be an array of coordinates {x: x0, y: y0}');
  for (var i = 0; i < coords.length; i++) {
    var c = coords[i];
    $.checkArgument(_.isNumber(c.x) && _.isNumber(c.y), 'coordinate ' + i + ' is invalid');
    var norm1 = Math.abs(this.position.x - c.x) + Math.abs(this.position.y - c.y);
    if (norm1 === 1) {
      return c;
    }
  }
  return false;
};

Transaction.prototype.hasPosition = function() {
  return !_.isUndefined(this.position) &&
    !_.isUndefined(this.position.x) &&
    !_.isUndefined(this.position.y);
};

module.exports = Transaction;
