/*
Copyright (c) 2011 Cory Boyd

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR 
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, 
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var dnsSupport = require('./dnssupport.js');

exports.create = function(conf, query, type, records) {
  response = {
    header: {
      id: query.header.id,
      qr: 1,
      opcode: 0,
      aa: 0,
      tc: 0,
      ra: 0,
      rd: 0,
      z: 0,
      rcode: query.header.rcode,
      qdcount: 1,
      ancount: 0,
      nscount: 0,
      arcount: 0,
    },
    question: {
      qname: query.question.qname,
      qtype: query.question.qtype,
      qclass: query.question.qclass,
    },
    rr: []
  };

	// if no error flag set, then add the resource record
	if (response.header.rcode == 0) {
		response.rr = _getResourceObjectArray(conf, query, type, records);
		response.header.ancount = records.length;
	}
  
  return response;
};

exports.createResponseBuffer = function(response) {
  var qnameLen = response.question.qname.length;
  var len = 16 + qnameLen;
  var buf = dnsSupport.getZeroBuf(len);
  
  response.header.id.copy(buf, 0, 0, 2);
  
  buf[2] = 0x00 | response.header.qr << 7 | response.header.opcode << 3 | response.header.aa << 2 | response.header.tc << 1 | response.header.rd;
  buf[3] = 0x00 | response.header.ra << 7 | response.header.z << 4 | response.header.rcode;
  dnsSupport.numToBuffer(buf, 4, response.header.qdcount, 2);
  dnsSupport.numToBuffer(buf, 6, response.header.ancount, 2);
  dnsSupport.numToBuffer(buf, 8, response.header.nscount, 2);
  dnsSupport.numToBuffer(buf, 10, response.header.arcount, 2);

  response.question.qname.copy(buf, 12, 0, qnameLen);
  response.question.qtype.copy(buf, 12 + qnameLen, 0, 2);
  response.question.qclass.copy(buf, 12 + qnameLen + 2, 0, 2);

  var rrStart = 12 + qnameLen + 4;
  for ( var i = 0; i < response.rr.length; i++ ) {
    var tmpBuf = dnsSupport.getZeroBuf( buf.length + response.rr[i].qname.length + response.rr[i].rdlength + 10 );
    buf.copy(tmpBuf);

    response.rr[i].qname.copy(tmpBuf, rrStart, 0, response.rr[i].qname.length);
    dnsSupport.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length, response.rr[i].qtype, 2);
    dnsSupport.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length + 2, response.rr[i].qclass, 2);
    dnsSupport.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length + 4, response.rr[i].ttl, 4);
    dnsSupport.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length + 8, response.rr[i].rdlength, 2);
    
    response.rr[i].rdata.copy( tmpBuf, rrStart+response.rr[i].qname.length + 10, 0, response.rr[i].rdlength );
    
    rrStart = rrStart + response.rr[i].qname.length + response.rr[i].rdlength + 10;
    
    buf = tmpBuf;
  }
  //TODO compression
   
  return buf;
}

var _getResourceObjectArray = function(conf, query, type, records) {
  //depending on the type, change how the buffer is constructed
  var getRdataBuffer = null;

	// select the right function to form response buffer from records fetched
  if ( type == 1 ) {
    getRdataBuffer = _getAddressRdataBuffer;
  } else if ( type == 15 ) {
    getRdataBuffer = _getMxRdataBuffer;
  } else if ( type == 5 ) {
    getRdataBuffer = _getCnameRdataBuffer;
  } else if ( type == 16 ) {
    getRdataBuffer = _getTxtRdataBuffer;
  } else {
    throw Error('Invalid or unsupported type "' + type + '"' );
  }

  rrList = [];
  records.forEach( function(r) {
    var resourceBuf = getRdataBuffer(r);
    var domain = dnsSupport.bufferToDomain(query.question.qname);
    
    rrList.push({
      qname: query.question.qname,
      qtype: type,
      qclass: 1,
      ttl: r.ttl,
      rdlength: resourceBuf.length,
      rdata: resourceBuf
    });
  });

  return rrList;
};

var _getAddressRdataBuffer = function(record) {
  return dnsSupport.addressToBuffer( record.content.toString() );
};

var _getMxRdataBuffer = function(record) {
  var exchBuf = dnsSupport.domainToBuffer( record.content );
  var prefBuf = dnsSupport.numToBuffer( Buffer(2), 0, record.priority );
  
  var buf = Buffer( exchBuf.length + prefBuf.length );
  prefBuf.copy( buf, 0, 0 );
  exchBuf.copy( buf, 2, 0 );
  
  return buf;
};

var _getCnameRdataBuffer = function(record) {
  return dnsSupport.domainToBuffer( record.content.toString() );
};

var _getTxtRdataBuffer = function(record) {
  return dnsSupport.stringToBuffer( record.content.toString() );
};
