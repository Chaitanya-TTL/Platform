namespace ConfigitAceIntegration.Infrastructure.Exceptions;

/// <summary>
/// Thrown when Configit API operation fails.
/// </summary>
public class ConfigitApiException : Exception
{
    public ConfigitApiException(string message) : base(message) { }
    
    public ConfigitApiException(string message, Exception innerException) 
        : base(message, innerException) { }
}

/// <summary>
/// Thrown when data validation fails.
/// </summary>
public class ValidationException : Exception
{
    public ValidationException(string message) : base(message) { }
    
    public ValidationException(string message, Exception innerException) 
        : base(message, innerException) { }
}

/// <summary>
/// Thrown when transformation operation fails.
/// </summary>
public class TransformationException : Exception
{
    public TransformationException(string message) : base(message) { }
    
    public TransformationException(string message, Exception innerException) 
        : base(message, innerException) { }
}
