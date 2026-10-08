package io.github.tokagero8.proof3161.proof.api;

import io.github.tokagero8.proof3161.timestamp.TimestampException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.io.UncheckedIOException;

@RestControllerAdvice(assignableTypes = ProofController.class)
public class ProofExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(ProofExceptionHandler.class);

    @ExceptionHandler({
            TimestampException.class,
            UncheckedIOException.class
    })
    public ProblemDetail handleTimestampFailure(
            RuntimeException exception
    ) {
        log.error("Proof timestamping failed", exception);

        var problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_GATEWAY,
                "Could not obtain a valid timestamp from the timestamp authority."
        );

        problem.setTitle("Timestamping failed");

        return problem;
    }
}
