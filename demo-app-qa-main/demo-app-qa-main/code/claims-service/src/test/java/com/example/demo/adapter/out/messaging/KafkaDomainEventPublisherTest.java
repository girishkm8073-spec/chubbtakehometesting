package com.example.demo.adapter.out.messaging;

import com.example.demo.domain.claim.ClaimStatus;
import com.example.demo.domain.claim.events.ClaimStatusChanged;
import com.example.demo.domain.claim.events.ClaimSubmitted;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KafkaDomainEventPublisherTest {

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private KafkaMessageSchemaValidator schemaValidator;

    private KafkaDomainEventPublisher publisher;

    @BeforeEach
    void setUp() {
        publisher = new KafkaDomainEventPublisher(kafkaTemplate, objectMapper, schemaValidator);
    }

    // TC-077: Event published to Kafka with correct topic and message key
    @Test
    void should_PublishEventToKafka_When_ClaimSubmittedEventProvided() throws JsonProcessingException {
        UUID claimId = UUID.randomUUID();
        var event = new ClaimSubmitted(
                UUID.randomUUID().toString(),
                claimId,
                UUID.randomUUID(),
                LocalDate.now(),
                BigDecimal.TEN,
                Instant.now()
        );

        ObjectMapper realMapper = new ObjectMapper();
        realMapper.findAndRegisterModules();
        publisher = new KafkaDomainEventPublisher(kafkaTemplate, realMapper, schemaValidator);
        doNothing().when(schemaValidator).validate(anyString(), anyString());
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(null));

        publisher.publish(event);

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("claim-events"), eq(claimId.toString()), payloadCaptor.capture());

        String payload = payloadCaptor.getValue();
        assertThat(payload).contains("\"eventType\":\"claim-submitted\"");
        assertThat(payload).contains("\"claimId\"");
        assertThat(payload).contains(claimId.toString());
        verify(schemaValidator).validate(payload, "ClaimSubmittedMessage");
    }

    // TC-077b: ClaimStatusChanged published with correct key
    @Test
    void should_PublishEventToKafka_When_ClaimStatusChangedEventProvided() throws JsonProcessingException {
        UUID claimId = UUID.randomUUID();
        var event = new ClaimStatusChanged(
                UUID.randomUUID().toString(),
                claimId,
                ClaimStatus.SUBMITTED,
                ClaimStatus.UNDER_REVIEW,
                UUID.randomUUID(),
                Instant.now()
        );

        ObjectMapper realMapper = new ObjectMapper();
        realMapper.findAndRegisterModules();
        publisher = new KafkaDomainEventPublisher(kafkaTemplate, realMapper, schemaValidator);
        doNothing().when(schemaValidator).validate(anyString(), anyString());
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(null));

        publisher.publish(event);

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("claim-events"), eq(claimId.toString()), payloadCaptor.capture());

        String payload = payloadCaptor.getValue();
        assertThat(payload).contains("\"eventType\":\"claim-status-changed\"");
        assertThat(payload).contains("\"newStatus\":\"UNDER_REVIEW\"");
        assertThat(payload).contains(claimId.toString());
        verify(schemaValidator).validate(payload, "ClaimStatusChangedMessage");
    }

    // TC-078: Event payload contains expected fields when serialized
    @Test
    void should_SerializeEventFields_When_EventPublished() throws JsonProcessingException {
        UUID claimId = UUID.randomUUID();
        var event = new ClaimSubmitted(
                UUID.randomUUID().toString(),
                claimId,
                UUID.randomUUID(),
                LocalDate.now(),
                BigDecimal.TEN,
                Instant.now()
        );

        ObjectMapper realMapper = new ObjectMapper();
        realMapper.findAndRegisterModules();
        publisher = new KafkaDomainEventPublisher(kafkaTemplate, realMapper, schemaValidator);
        doNothing().when(schemaValidator).validate(anyString(), anyString());
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(null));

        publisher.publish(event);

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("claim-events"), eq(claimId.toString()), payloadCaptor.capture());

        String payload = payloadCaptor.getValue();
        assertThat(payload).contains("\"eventId\"");
        assertThat(payload).contains("\"eventType\"");
        assertThat(payload).contains("\"payload\"");
        assertThat(payload).contains(claimId.toString());
    }

    // TC-079: Failed serialization throws IllegalStateException
    @Test
    void should_ThrowIllegalStateException_When_SerializationFails() throws JsonProcessingException {
        var event = new ClaimSubmitted(
                UUID.randomUUID().toString(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                LocalDate.now(),
                BigDecimal.TEN,
                Instant.now()
        );

        ObjectMapper throwingMapper = mock(ObjectMapper.class);
        ObjectNode safeNode = new ObjectMapper().createObjectNode();
        when(throwingMapper.createObjectNode()).thenReturn(safeNode);
        when(throwingMapper.writeValueAsString(any(ObjectNode.class)))
                .thenThrow(new JsonProcessingException("test") {});

        publisher = new KafkaDomainEventPublisher(kafkaTemplate, throwingMapper, schemaValidator);

        assertThatThrownBy(() -> publisher.publish(event))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Failed to serialize domain event");
    }

    // TC-NEW-001: Publisher calls validator with correct payload and schema name for ClaimSubmitted
    @Test
    void should_CallValidatorWithCorrectArgs_When_ClaimSubmittedEventPublished() throws JsonProcessingException {
        UUID claimId = UUID.randomUUID();
        var event = new ClaimSubmitted(
                UUID.randomUUID().toString(),
                claimId,
                UUID.randomUUID(),
                LocalDate.now(),
                BigDecimal.TEN,
                Instant.now()
        );

        ObjectMapper realMapper = new ObjectMapper();
        realMapper.findAndRegisterModules();
        publisher = new KafkaDomainEventPublisher(kafkaTemplate, realMapper, schemaValidator);
        doNothing().when(schemaValidator).validate(anyString(), anyString());
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(null));

        publisher.publish(event);

        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(eq("claim-events"), eq(claimId.toString()), payloadCaptor.capture());
        String payload = payloadCaptor.getValue();
        verify(schemaValidator).validate(payload, "ClaimSubmittedMessage");
    }

    // TC-NEW-002: Publisher propagates KafkaMessageValidationException when validator rejects missing required field
    @Test
    void should_PropagateValidationException_When_ValidatorRejectsMissingRequiredField() throws JsonProcessingException {
        UUID claimId = UUID.randomUUID();
        var event = new ClaimSubmitted(
                UUID.randomUUID().toString(),
                claimId,
                UUID.randomUUID(),
                LocalDate.now(),
                BigDecimal.TEN,
                Instant.now()
        );

        ObjectMapper mockMapper = mock(ObjectMapper.class);
        ObjectNode envelope = new ObjectMapper().createObjectNode();
        String invalidSubmittedPayload = "{\"eventType\":\"claim-submitted\",\"eventId\":\"evt-1\",\"payload\":{}}";
        when(mockMapper.createObjectNode()).thenReturn(envelope);
        when(mockMapper.writeValueAsString(any(ObjectNode.class)))
                .thenReturn(invalidSubmittedPayload);
        publisher = new KafkaDomainEventPublisher(kafkaTemplate, mockMapper, schemaValidator);
        doThrow(new KafkaMessageValidationException("claimId: is missing but it is required"))
                .when(schemaValidator).validate(invalidSubmittedPayload, "ClaimSubmittedMessage");

        assertThatThrownBy(() -> publisher.publish(event))
                .isInstanceOf(KafkaMessageValidationException.class)
                .hasMessageContaining("claimId");
    }

    // TC-NEW-003: Publisher propagates KafkaMessageValidationException when validator rejects invalid enum value
    @Test
    void should_PropagateValidationException_When_ValidatorRejectsInvalidClaimStatus() throws JsonProcessingException {
        UUID claimId = UUID.randomUUID();
        var event = new ClaimStatusChanged(
                UUID.randomUUID().toString(),
                claimId,
                ClaimStatus.SUBMITTED,
                ClaimStatus.UNDER_REVIEW,
                UUID.randomUUID(),
                Instant.now()
        );

        ObjectMapper mockMapper = mock(ObjectMapper.class);
        ObjectNode envelope = new ObjectMapper().createObjectNode();
        String invalidStatusPayload = "{\"eventType\":\"claim-status-changed\",\"eventId\":\"evt-1\",\"payload\":{\"oldStatus\":\"INVALID_STATUS\",\"newStatus\":\"UNDER_REVIEW\",\"claimId\":\"" + claimId + "\"}}";
        when(mockMapper.createObjectNode()).thenReturn(envelope);
        when(mockMapper.writeValueAsString(any(ObjectNode.class)))
                .thenReturn(invalidStatusPayload);
        publisher = new KafkaDomainEventPublisher(kafkaTemplate, mockMapper, schemaValidator);
        doThrow(new KafkaMessageValidationException("oldStatus: does not have a value in the enumeration"))
                .when(schemaValidator).validate(invalidStatusPayload, "ClaimStatusChangedMessage");

        assertThatThrownBy(() -> publisher.publish(event))
                .isInstanceOf(KafkaMessageValidationException.class)
                .hasMessageContaining("oldStatus");
    }
}
