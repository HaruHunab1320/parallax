"use strict";
/**
 * @parallax/meta-agents
 *
 * Pattern-aware agents and utilities for Parallax
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternValidator = exports.PatternAssembler = exports.PatternComposer = exports.arePrimitivesCompatible = exports.findCompatiblePrimitives = exports.getPrimitivesByCategory = exports.getPrimitiveDescriptor = exports.PRIMITIVE_DESCRIPTORS = exports.createPatternComposerAgent = exports.PatternComposerAgent = exports.ConfidenceAggregator = exports.withConfidence = exports.makePatternAware = exports.patternAware = exports.PatternAwareWrapper = void 0;
// Wrappers
var pattern_aware_1 = require("./wrappers/pattern-aware");
Object.defineProperty(exports, "PatternAwareWrapper", { enumerable: true, get: function () { return pattern_aware_1.PatternAwareWrapper; } });
Object.defineProperty(exports, "patternAware", { enumerable: true, get: function () { return pattern_aware_1.patternAware; } });
Object.defineProperty(exports, "makePatternAware", { enumerable: true, get: function () { return pattern_aware_1.makePatternAware; } });
var confidence_extractor_1 = require("./wrappers/confidence-extractor");
Object.defineProperty(exports, "withConfidence", { enumerable: true, get: function () { return confidence_extractor_1.withConfidence; } });
Object.defineProperty(exports, "ConfidenceAggregator", { enumerable: true, get: function () { return confidence_extractor_1.ConfidenceAggregator; } });
// Agents
var pattern_composer_agent_1 = require("./agents/pattern-composer-agent");
Object.defineProperty(exports, "PatternComposerAgent", { enumerable: true, get: function () { return pattern_composer_agent_1.PatternComposerAgent; } });
Object.defineProperty(exports, "createPatternComposerAgent", { enumerable: true, get: function () { return pattern_composer_agent_1.createPatternComposerAgent; } });
// Knowledge
var primitive_descriptors_1 = require("./knowledge/primitive-descriptors");
Object.defineProperty(exports, "PRIMITIVE_DESCRIPTORS", { enumerable: true, get: function () { return primitive_descriptors_1.PRIMITIVE_DESCRIPTORS; } });
Object.defineProperty(exports, "getPrimitiveDescriptor", { enumerable: true, get: function () { return primitive_descriptors_1.getPrimitiveDescriptor; } });
Object.defineProperty(exports, "getPrimitivesByCategory", { enumerable: true, get: function () { return primitive_descriptors_1.getPrimitivesByCategory; } });
Object.defineProperty(exports, "findCompatiblePrimitives", { enumerable: true, get: function () { return primitive_descriptors_1.findCompatiblePrimitives; } });
Object.defineProperty(exports, "arePrimitivesCompatible", { enumerable: true, get: function () { return primitive_descriptors_1.arePrimitivesCompatible; } });
// Re-export composition utilities from primitives package
var primitives_1 = require("@parallax/primitives");
Object.defineProperty(exports, "PatternComposer", { enumerable: true, get: function () { return primitives_1.PatternComposer; } });
Object.defineProperty(exports, "PatternAssembler", { enumerable: true, get: function () { return primitives_1.PatternAssembler; } });
Object.defineProperty(exports, "PatternValidator", { enumerable: true, get: function () { return primitives_1.PatternValidator; } });
