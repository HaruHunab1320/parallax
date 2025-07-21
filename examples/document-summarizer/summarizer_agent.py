#!/usr/bin/env python3
"""
Document Summarization Agent

Analyzes and summarizes documents with uncertainty tracking.
Supports multiple summarization strategies and confidence scoring.
"""

import asyncio
import re
from typing import Any, Dict, List, Tuple
from collections import Counter
import math

# This would normally be: from parallax import ParallaxAgent, run_agent
import sys
sys.path.append('../../packages/sdk-python/src')

from parallax import ParallaxAgent, run_agent


class DocumentSummarizerAgent(ParallaxAgent):
    """Agent that summarizes documents with confidence scoring."""
    
    def __init__(self):
        super().__init__(
            agent_id="summarizer-1",
            name="Document Summarizer",
            capabilities=["summarization", "text-analysis", "extraction", "analysis"],
            metadata={
                "expertise": 0.82,
                "capability_scores": {
                    "summarization": 0.85,
                    "extraction": 0.88,
                    "text-analysis": 0.80,
                },
                "version": "1.0.0",
                "max_document_length": 50000,
            }
        )
        
        # Stop words for better keyword extraction
        self.stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'under', 'again',
            'further', 'then', 'once', 'is', 'are', 'was', 'were', 'been', 'be',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'shall', 'can', 'cannot'
        }
    
    async def analyze(
        self, task: str, data: Dict[str, Any] = None
    ) -> Tuple[Dict[str, Any], float]:
        """Analyze and summarize the document."""
        
        # Validate required data
        if not data or "text" not in data:
            return {
                "error": "No text provided for summarization"
            }, 0.0
        
        text = data.get("text", "")
        options = data.get("options", {})
        
        # Determine summarization strategy
        strategy = options.get("strategy", "auto")
        target_length = options.get("target_length", "medium")
        focus = options.get("focus", None)  # e.g., "technical", "business"
        
        # Calculate base confidence from document characteristics
        confidence = self._calculate_base_confidence(text)
        
        # Apply appropriate summarization strategy
        if strategy == "auto":
            strategy = self._select_strategy(text)
            if hasattr(self, '_uncertainties'):
                self._uncertainties.append(f"Auto-selected {strategy} strategy")
        
        if strategy == "extractive":
            summary, method_confidence = await self._extractive_summarization(
                text, target_length, focus
            )
        elif strategy == "key_points":
            summary, method_confidence = await self._key_points_summarization(
                text, focus
            )
        elif strategy == "hierarchical":
            summary, method_confidence = await self._hierarchical_summarization(
                text, target_length
            )
        else:
            summary, method_confidence = await self._hybrid_summarization(
                text, target_length, focus
            )
        
        # Combine confidences
        final_confidence = confidence * method_confidence
        
        # Extract metadata
        metadata = self._extract_metadata(text)
        
        result = {
            "summary": summary,
            "strategy_used": strategy,
            "metadata": metadata,
            "quality_metrics": {
                "compression_ratio": len(summary) / len(text),
                "readability_score": self._calculate_readability(summary),
                "coverage_score": self._calculate_coverage(summary, text),
            },
            "key_topics": self._extract_key_topics(text),
        }
        
        # Add focus-specific information
        if focus:
            result["focus_highlights"] = self._extract_focus_highlights(text, focus)
        
        # Ensure confidence is within bounds
        final_confidence = max(0.1, min(0.95, final_confidence))
        
        # Add reasoning
        result["reasoning"] = (
            f"Summarization completed using {strategy} strategy "
            f"with confidence {final_confidence:.2f}"
        )
        
        # Add uncertainties if any
        uncertainties = []
        if len(text) < 100:
            uncertainties.append("Document is very short")
        elif len(text) > 50000:
            uncertainties.append("Document exceeds optimal length")
        if '.' not in text:
            uncertainties.append("No clear sentence structure detected")
        
        if uncertainties:
            result["uncertainties"] = uncertainties
        
        return result, final_confidence
    
    def _calculate_base_confidence(self, text: str) -> float:
        """Calculate confidence based on document characteristics."""
        confidence = 0.8
        
        # Length factors
        length = len(text)
        if length < 100:
            confidence *= 0.5  # Too short
            # Document is very short
        elif length > 50000:
            confidence *= 0.8  # Very long
            # Document exceeds optimal length
        
        # Language complexity
        avg_word_length = sum(len(word) for word in text.split()) / max(len(text.split()), 1)
        if avg_word_length > 8:
            confidence *= 0.9  # Complex vocabulary
        
        # Structure indicators
        has_paragraphs = '\n\n' in text or '\r\n\r\n' in text
        has_sentences = '.' in text
        
        if not has_sentences:
            confidence *= 0.7
            # No clear sentence structure detected
        
        return confidence
    
    def _select_strategy(self, text: str) -> str:
        """Select the best summarization strategy based on document characteristics."""
        length = len(text)
        
        # Short documents
        if length < 500:
            return "key_points"
        
        # Check for structure
        has_sections = bool(re.search(r'\n#{1,6}\s+\w+', text))  # Markdown headers
        has_bullets = bool(re.search(r'\n\s*[-*•]\s+\w+', text))
        
        if has_sections:
            return "hierarchical"
        elif has_bullets:
            return "key_points"
        elif length > 5000:
            return "hybrid"
        else:
            return "extractive"
    
    async def _extractive_summarization(
        self, text: str, target_length: str, focus: str = None
    ) -> Tuple[str, float]:
        """Extract key sentences from the document."""
        sentences = self._split_sentences(text)
        if len(sentences) < 3:
            return text, 0.5
        
        # Score sentences
        scores = {}
        word_freq = self._calculate_word_frequency(text)
        
        for i, sentence in enumerate(sentences):
            score = 0
            words = sentence.lower().split()
            
            # Word frequency score
            for word in words:
                if word in word_freq and word not in self.stop_words:
                    score += word_freq[word]
            
            # Position score (beginning and end are important)
            position_score = 1.0
            if i < 3:
                position_score = 1.2
            elif i >= len(sentences) - 3:
                position_score = 1.1
            
            # Focus score
            if focus and focus.lower() in sentence.lower():
                score *= 1.5
            
            scores[i] = score * position_score / max(len(words), 1)
        
        # Select sentences
        num_sentences = self._get_target_sentences(len(sentences), target_length)
        selected_indices = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:num_sentences]
        selected_indices = sorted([idx for idx, _ in selected_indices])
        
        summary = ' '.join([sentences[i] for i in selected_indices])
        confidence = min(0.9, 0.7 + len(selected_indices) * 0.05)
        
        return summary, confidence
    
    async def _key_points_summarization(
        self, text: str, focus: str = None
    ) -> Tuple[str, float]:
        """Extract key points as bullet points."""
        sentences = self._split_sentences(text)
        
        # Group similar sentences
        key_points = []
        used_sentences = set()
        
        for i, sentence in enumerate(sentences):
            if i in used_sentences or len(sentence.split()) < 5:
                continue
            
            # Find related sentences
            related = [sentence]
            for j, other in enumerate(sentences[i+1:], i+1):
                if j not in used_sentences and self._sentence_similarity(sentence, other) > 0.5:
                    related.append(other)
                    used_sentences.add(j)
            
            # Create key point from related sentences
            if related:
                key_point = self._merge_related_sentences(related)
                if focus and focus.lower() in key_point.lower():
                    key_points.insert(0, f"• {key_point}")
                else:
                    key_points.append(f"• {key_point}")
        
        summary = '\n'.join(key_points[:10])  # Limit to 10 key points
        confidence = min(0.85, 0.6 + len(key_points) * 0.03)
        
        return summary, confidence
    
    async def _hierarchical_summarization(
        self, text: str, target_length: str
    ) -> Tuple[str, float]:
        """Summarize hierarchically structured documents."""
        # Simple section detection
        sections = re.split(r'\n(?=#{1,6}\s+|\d+\.\s+|[A-Z][^.!?]*:)', text)
        
        if len(sections) < 2:
            # Fall back to extractive
            return await self._extractive_summarization(text, target_length)
        
        summaries = []
        for section in sections[:10]:  # Limit sections
            if len(section.strip()) > 50:
                # Summarize each section
                section_summary, _ = await self._extractive_summarization(
                    section, "short"
                )
                if section_summary:
                    summaries.append(section_summary)
        
        summary = '\n\n'.join(summaries)
        confidence = 0.8
        
        return summary, confidence
    
    async def _hybrid_summarization(
        self, text: str, target_length: str, focus: str = None
    ) -> Tuple[str, float]:
        """Combine multiple summarization strategies."""
        # Get extractive summary
        extractive, conf1 = await self._extractive_summarization(
            text, target_length, focus
        )
        
        # Get key points
        key_points, conf2 = await self._key_points_summarization(text, focus)
        
        # Combine results
        summary = f"{extractive}\n\nKey Points:\n{key_points}"
        confidence = (conf1 + conf2) / 2
        
        return summary, confidence
    
    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        # Simple sentence splitter
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if len(s.strip()) > 10]
    
    def _calculate_word_frequency(self, text: str) -> Dict[str, float]:
        """Calculate normalized word frequency."""
        words = text.lower().split()
        word_count = Counter(word for word in words if word not in self.stop_words)
        max_freq = max(word_count.values()) if word_count else 1
        
        return {word: freq / max_freq for word, freq in word_count.items()}
    
    def _get_target_sentences(self, total: int, target_length: str) -> int:
        """Get number of sentences based on target length."""
        ratios = {
            "brief": 0.1,
            "short": 0.2,
            "medium": 0.3,
            "long": 0.5,
            "detailed": 0.7
        }
        ratio = ratios.get(target_length, 0.3)
        return max(1, min(int(total * ratio), 20))
    
    def _sentence_similarity(self, s1: str, s2: str) -> float:
        """Calculate simple sentence similarity."""
        words1 = set(s1.lower().split())
        words2 = set(s2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union)
    
    def _merge_related_sentences(self, sentences: List[str]) -> str:
        """Merge related sentences into a coherent point."""
        if len(sentences) == 1:
            return sentences[0]
        
        # Simple merge - take the longest sentence as base
        base = max(sentences, key=len)
        return base
    
    def _extract_metadata(self, text: str) -> Dict[str, Any]:
        """Extract document metadata."""
        return {
            "length": len(text),
            "word_count": len(text.split()),
            "sentence_count": len(self._split_sentences(text)),
            "avg_sentence_length": len(text.split()) / max(len(self._split_sentences(text)), 1),
            "unique_words": len(set(text.lower().split())),
        }
    
    def _calculate_readability(self, text: str) -> float:
        """Calculate simple readability score."""
        sentences = self._split_sentences(text)
        words = text.split()
        
        if not sentences or not words:
            return 0.0
        
        avg_sentence_length = len(words) / len(sentences)
        avg_word_length = sum(len(word) for word in words) / len(words)
        
        # Simple readability formula
        readability = 100 - (avg_sentence_length * 1.5 + avg_word_length * 10)
        return max(0, min(100, readability))
    
    def _calculate_coverage(self, summary: str, original: str) -> float:
        """Calculate how well the summary covers the original."""
        summary_words = set(summary.lower().split())
        original_words = set(original.lower().split())
        
        important_words = {w for w in original_words if w not in self.stop_words}
        covered_words = summary_words.intersection(important_words)
        
        if not important_words:
            return 0.0
        
        return len(covered_words) / len(important_words)
    
    def _extract_key_topics(self, text: str) -> List[str]:
        """Extract key topics from the document."""
        words = text.lower().split()
        word_count = Counter(word for word in words 
                           if word not in self.stop_words and len(word) > 3)
        
        # Get top topics
        topics = [word for word, _ in word_count.most_common(5)]
        
        # Look for multi-word topics (simple bigrams)
        bigrams = []
        for i in range(len(words) - 1):
            if (words[i] not in self.stop_words and 
                words[i+1] not in self.stop_words and
                len(words[i]) > 3 and len(words[i+1]) > 3):
                bigrams.append(f"{words[i]} {words[i+1]}")
        
        bigram_count = Counter(bigrams)
        top_bigrams = [bigram for bigram, count in bigram_count.most_common(3) if count > 1]
        
        return topics + top_bigrams
    
    def _extract_focus_highlights(self, text: str, focus: str) -> List[str]:
        """Extract sentences related to the focus area."""
        sentences = self._split_sentences(text)
        focus_sentences = []
        
        focus_keywords = focus.lower().split()
        
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if any(keyword in sentence_lower for keyword in focus_keywords):
                focus_sentences.append(sentence)
        
        return focus_sentences[:5]  # Top 5 relevant sentences


async def main():
    """Run the summarization agent."""
    agent = DocumentSummarizerAgent()
    
    # Example: Test the agent locally before serving
    print("Testing agent locally...")
    result, confidence = await agent.analyze(
        "Summarize this document",
        {
            "text": """
            Artificial Intelligence (AI) has become a transformative technology across industries. 
            Machine learning algorithms now power recommendation systems, autonomous vehicles, and medical diagnostics.
            
            The rapid advancement of AI brings both opportunities and challenges. While AI can enhance productivity 
            and solve complex problems, it also raises concerns about job displacement and privacy.
            
            Key applications of AI include:
            - Natural language processing for chatbots and translation
            - Computer vision for image recognition and autonomous driving
            - Predictive analytics for business intelligence
            - Robotics for manufacturing and healthcare
            
            As AI continues to evolve, responsible development and deployment become crucial. Organizations must 
            consider ethical implications, ensure transparency, and maintain human oversight.
            """,
            "options": {
                "strategy": "auto",
                "target_length": "medium",
                "focus": "applications"
            }
        }
    )
    
    print(f"Summary: {result['summary']}")
    print(f"Confidence: {confidence}")
    print(f"Strategy used: {result['strategy_used']}")
    print(f"Key topics: {result['key_topics']}")
    
    # Start serving
    print("\nStarting gRPC server...")
    run_agent(agent)


if __name__ == "__main__":
    asyncio.run(main())