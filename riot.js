/*jslint white: false plusplus: false onevar: false browser: true evil: true*/
/*global window: true*/
var Riot = {
  results:  [],
  contexts: [],

  run: function(tests) {
    if (typeof XPCOMCore !== 'undefined') {
      Riot.formatter = new Riot.Formatters.XPComCore();
      Riot.runAndReport(tests);
      Sys.exit(Riot.exitCode);
    } else if (typeof window === 'undefined') {
      Riot.formatter = new Riot.Formatters.Text();
      Riot.runAndReport(tests);
      java.lang.System.exit(Riot.exitCode);
    } else {
      Riot.formatter = new Riot.Formatters.HTML();
      var onload = window.onload;
      window.onload = function() {
        if (onload) { window.onload(); }
        Riot.runAndReport(tests);
      };
    }
  },

  runAndReport: function(tests) {
    var benchmark = Riot.Benchmark.run(1, function() { Riot.runAllContexts(tests); });
    Riot.formatter.separator();
    Riot.summariseAllResults();
    Riot.formatter.line(benchmark);
  },

  runAllContexts: function(tests) {
    if (typeof tests !== 'undefined') {
      this.withThis(Riot, tests)();
    }

    for (var i = 0; i < this.contexts.length; i++) {
      this.contexts[i].run();
    }
  },

  functionBody: function(fn) {
    return fn.toString().match(/^[^\{]*{((.*\n*)*)}/m)[1];
  },

  withThis: function(that, fn) {
    return function() { eval('with (that) {\n' + Riot.functionBody(fn) + '\n}\n'); };
  },

  context: function(title, callback) {
    var context = new Riot.Context(title, callback);
    Riot.contexts.push(context);
    return context;
  },

  given: function(title, callback) {
    title = 'Given ' + title;
    return Riot.context(title, callback);
  },

  summariseAllResults: function() { return this.summarise(this.results); },

  summarise: function(results) {
    var failures = 0;
    for (var i = 0; i < results.length; i++) {
      if (!results[i].pass) { failures++; }
    }
    this.formatter.line(results.length + ' assertions: ' + failures + ' failures');
    this.exitCode = failures > 0 ? 1 : 0;
  },

  addResult: function(context, assertion, pass) {
    var result = {
      assertion: assertion,
      pass:      pass,
      context:   context
    };
    this.results.push(result);
  }
};

Riot.Benchmark = {
  results: [],

  addResult: function(start, end) {
    this.results.push(end - start);
  },

  displayResults: function() {
    var total   = 0,
        seconds = 0,
        i       = 0;
    for (i = 0; i < this.results.length; i++) {
      total += this.results[i];
    }
    seconds = total / 1000;
    return 'Elapsed time: ' + total + 'ms (' + seconds + ' seconds)';
  },

  run: function(times, callback) {
    this.results = [];
    for (var i = 0; i < times; i++) {
      var start = new Date(),
          end   = null;
      callback();
      end = new Date();
      this.addResult(start, end);
    }
    return this.displayResults();
  }
};

Riot.Formatters = {
  HTML: function() {
    function display(html) {
      var results = document.getElementById('test-results');
      results.innerHTML += html;
    }

    this.line = function(text) {
      display('<p>' + text + '</p>');
    };

    this.pass = function(message) {
      display('<p class="pass">' + message + '</p>');
    };

    this.fail = function(message) {
      display('<p class="fail">' + message + '</p>');
    };

    this.error = function(message, exception) {
      this.fail(message);
      display('<p class="exception">Exception: ' + exception + '</p>');
    };

    this.context = function(name) {
      display('<h3>' + name + '</h3>');
    };

    this.separator = function() {
      display('<hr />');
    };
  },

  Text: function() {
    function display(text) {
      print(text);
    }

    this.line = function(text) {
      display(text);
    };

    this.pass = function(message) {
      this.line('  +[32m ' + message + '[0m');
    };

    this.fail = function(message) {
      this.line('  -[31m ' + message + '[0m');
    };

    this.error = function(message, exception) {
      this.fail(message);
      this.line('  Exception: ' + exception);
    };

    this.context = function(name) {
      this.line(name);
    };

    this.separator = function() {
      this.line('');
    };
  },

  XPComCore: function() {
    var formatter = new Riot.Formatters.Text();
    formatter.line = function(text) {
      puts(text);
    };
    return formatter;
  }
};

Riot.Context = function(name, callback) {
  this.name             = name;
  this.callback         = callback;
  this.assertions       = [];
  this.should           = this.asserts;
  this.given            = Riot.given;
};

Riot.Context.prototype = {
  asserts: function(name, result) {
    var assertion = new Riot.Assertion(this.name, name, result);
    this.assertions.push(assertion);
    return assertion;
  },

  setup: function(setupFunction) {
    this.setupFunction = setupFunction;
  },

  teardown: function(teardownFunction) {
    this.teardownFunction = teardownFunction;
  },

  runSetup: function() {
    if (typeof this.setupFunction !== 'undefined') {
      return this.setupFunction();
    }
  },

  runTeardown: function() {
    if (typeof this.teardownFunction !== 'undefined') {
      return this.teardownFunction();
    }
  },

  run: function() {
    Riot.formatter.context(this.name);
    Riot.withThis(this, this.callback)();
    this.runSetup();
    for (var i = 0; i < this.assertions.length; i++) {
      var pass = false,
          assertion = this.assertions[i];
      try {
        assertion.run();
        pass = true;
        Riot.formatter.pass(assertion.name);
      } catch (e) {
        if (typeof e.name !== 'undefined' && e.name === 'Riot.AssertionFailure') {
          Riot.formatter.fail(e.message);
        } else {
          Riot.formatter.error(assertion.name, e);
        }
      }

      Riot.addResult(this.name, assertion.name, pass);
    }
    this.runTeardown();
  }
};

Riot.AssertionFailure = function(message) {
  var error = new Error(message);
  error.name = 'Riot.AssertionFailure';
  return error;
};

Riot.Assertion = function(contextName, name, expected) {
  this.name          = name;
  this.expectedValue = expected;
  this.contextName   = contextName;
  this.kindOf        = this.typeOf;
  this.isTypeOf      = this.typeOf;

  this.setAssertion(function(actual) {
    if ((actual() === null) || (actual() === undefined)) {
      throw(new Riot.AssertionFailure("Expected a value but got '" + actual() + "'"));
    }
  });
};

Riot.Assertion.prototype = {
  setAssertion: function(assertion) {
    this.assertion = assertion;
  },

  run: function() {
    var that = this;
    this.assertion(function() { return that.expected(); });
  },

  fail: function(message) {
    throw(new Riot.AssertionFailure(message));
  },

  expected: function() {
    if (typeof this.expectedMemo === 'undefined') {
      if (typeof this.expectedValue === 'function') {
        try {
          this.expectedMemo = this.expectedValue();
        } catch (exception) {
          this.expectedValue = exception;
        }
      } else {
        this.expectedMemo = this.expectedValue;
      }
    }
    return this.expectedMemo;
  },

  /* Assertions */
  equals: function(expected) {
    this.setAssertion(function(actual) {
      if (actual() !== expected) {
        this.fail(expected + ' does not equal: ' + actual());
      }
    });
  },

  matches: function(expected) {
    this.setAssertion(function(actual) {
      if (!expected.test(actual())) {
        this.fail("Expected '" + actual() + "' to match '" + expected + "'");
      }
    });
  },

  raises: function(expected) {
    this.setAssertion(function(actual) {
      try {
        actual();
        return;
      } catch (exception) {
        if (expected !== exception) {
          this.fail('raised ' + exception  + ' instead of ' + expected);
        }
      }
      this.fail('did not raise ' + expected);
    });
  },

  typeOf: function(expected) {
    this.setAssertion(function(actual) {
      var t = typeof actual();
      if (t === 'object') {
        if (actual()) {
          if (typeof actual().length === 'number' &&
              !(actual.propertyIsEnumerable('length')) &&
              typeof actual().splice === 'function') {
            t = 'array';
          }
        } else {
          t = 'null';
        }
      }

      if (t !== expected.toLowerCase()) {
        this.fail(expected + ' is not a type of ' + actual());
      }
    });
  },

  isTrue: function() {
    this.setAssertion(function(actual) {
      if (actual() !== true) {
        this.fail(actual() + ' was not true');
      }
    });
  },

  isNull: function() {
    this.setAssertion(function(actual) {
      if (actual() !== null) {
        this.fail(actual() + ' was not null');
      }
    });
  }
};
