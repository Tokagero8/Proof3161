package io.github.tokagero8.proof3161.verification.api;

import io.github.tokagero8.proof3161.verification.InvalidVerificationRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice(assignableTypes = VerificationController.class)
public class VerificationExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(InvalidVerificationRequestException.class)
    public ProblemDetail handleInvalidRequest(
            InvalidVerificationRequestException exception
    ) {
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST,
                exception.getMessage()
        );
    }
}
